import json
import asyncio
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import httpx

from .tools import TOOL_SPECS, execute_tool

router = APIRouter(tags=["ollama"])
OLLAMA_URL = "http://localhost:11434/api/chat"
OLLAMA_GENERATE_URL = "http://localhost:11434/api/generate"

EMERGENCY_MODE = False

SYSTEM_PROMPT = (
    "Sen PC Manager asistanisin. Kullanicinin Linux sistemini yonetmesine yardimci oluyorsun. "
    "Kullanici dogal dilde komut verecek, sen de uygun tool'lari cagirarak cevap vereceksin. "
    "Tools'larin yetmiyorsa exec_command ile shell komutu calistirabilirsin. "
    "Turkce cevap ver. Kisaca ve ozetle, kullanicinin anlayacagi sekilde cevapla. "
    "Tool sonuclarini kullaniciya yorumlayarak aktar, ham JSON gosterme. "
    "Kullanici deprem sordugunda veya son depremleri ogrenmek istediginde get_deprem tool'unu kullan. "
    "Kullanici web'de arama yapmak, guncel bilgi almak, haber ogrenmek istediginde web_search tool'unu kullan. "
    "Bir sayfanin detayli icerigini okumak icin web_fetch tool'unu kullan. "
    "Tool hata verirse kullaniciya kisa ve anlasilir sekilde acikla, panik yapma."
)

EMERGENCY_PROMPT = (
    "ACIL DURUM MODU AKTIF! Sen bir acil durum kurtarma asistanisin. Buyuk bir deprem oldugunu varsay."
    "Kesinlikle Turkce cevap ver. Amacin sadece kullanicinin hayatta kalmasina yardim etmek."
    "Asla gereksiz konusma, sadece kritik bilgi ver. "
    "Tools'lari aktif kullan: web_search ile guncel haberleri, web_fetch ile detaylari, get_deprem ile deprem verilerini getir. "
    "Su konularda yardim et:"
    "1. Guvenli toplanma alanlari ve yapilmasi gerekenler"
    "2. Ilk yardim (kanama, kirik, sok)"
    "3. Acil durum cantasinda bulunmasi gerekenler"
    "4. Artci depremlerde yapilmasi gerekenler"
    "5. Enkaz altinda kalma durumunda hayatta kalma"
    "6. Iletisim ve yardim cagirma yontemleri"
    "7. Su ve yiyecek yonetimi"
    "8. Enkaz altinda isi koruma"
    "Soğukkanli ol, net ve kisa talimatlar ver. Kullanicinin panik yapmasini engelle. "
    "Tool sonuclarini kullaniciya yorumlayarak aktar, ham JSON gosterme. "
    "Tool hata verirse kullaniciyi bilgilendir ve alternatif cozum oner."
)


@router.get("/ollama/models")
async def list_models():
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get("http://localhost:11434/api/tags", timeout=5)
        models = resp.json().get("models", [])
        return [
            {"name": m["name"], "size_gb": round(m.get("size", 0) / 1e9, 1),
             "modified": m.get("modified_at", "")[:10]}
            for m in models
        ]
    except Exception as e:
        return {"error": f"Ollama'ya ulasilamadi: {str(e)}"}


@router.post("/ollama/unload")
async def unload_model(body: dict = {}):
    model = body.get("model", "gemma4:e4b")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(OLLAMA_GENERATE_URL, json={
                "model": model,
                "keep_alive": "0m",
            }, timeout=10)
        return {"success": True, "model": model, "message": f"{model} bellekten bosaltildi"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/ollama/emergency")
async def get_emergency():
    return {"emergency": EMERGENCY_MODE, "prompt": EMERGENCY_PROMPT}

@router.post("/ollama/emergency")
async def set_emergency(body: dict):
    global EMERGENCY_MODE
    EMERGENCY_MODE = body.get("emergency", False)
    return {"emergency": EMERGENCY_MODE}

@router.post("/ollama/chat/stream")
async def chat_stream(body: dict):
    model = body.get("model", "gemma4:e4b")
    messages = body.get("messages", [])
    max_tool_rounds = min(body.get("max_tool_rounds", 5), 10)
    show_tool_calls = body.get("show_tool_calls", True)

    if not messages or messages[-1].get("role") != "user":
        raise HTTPException(400, "Son mesaj kullaniciya ait olmali")

    prompt = EMERGENCY_PROMPT if EMERGENCY_MODE else SYSTEM_PROMPT
    full_messages = [{"role": "system", "content": prompt}] + messages

    async def agent_loop():
        tool_round = 0
        current_messages = full_messages[:]

        while tool_round < max_tool_rounds:
            async with httpx.AsyncClient() as client:
                payload = {
                    "model": model,
                    "messages": current_messages,
                    "stream": True,
                    "tools": TOOL_SPECS,
                    "keep_alive": "1m",
                }
                try:
                    async with client.stream("POST", OLLAMA_URL, json=payload, timeout=120) as resp:
                        if resp.status_code != 200:
                            err = await resp.aread()
                            yield f"data: {json.dumps({'error': f'Ollama hatasi: {err.decode()[:200]}'})}\n\n"
                            yield f"data: [DONE]\n\n"
                            return

                        tool_calls = []
                        content_parts = []
                        current_tool = None
                        yielded_content = False

                        async for line in resp.aiter_lines():
                            if not line.strip():
                                continue
                            try:
                                chunk = json.loads(line)
                            except json.JSONDecodeError:
                                continue

                            delta = chunk.get("message", {})
                            msg = chunk.get("message", {})

                            if "content" in delta and delta["content"]:
                                content_parts.append(delta["content"])
                                yield f"data: {json.dumps({'type': 'content', 'text': delta['content']})}\n\n"
                                yielded_content = True

                            if "tool_calls" in msg:
                                for tc in msg["tool_calls"]:
                                    fn = tc.get("function", {})
                                    name = fn.get("name", "")
                                    args = fn.get("arguments", {})
                                    if isinstance(args, str):
                                        try:
                                            args = json.loads(args)
                                        except json.JSONDecodeError:
                                            args = {}
                                    tool_calls.append({"name": name, "arguments": args})
                                    if show_tool_calls:
                                        yield f"data: {json.dumps({'type': 'tool_start', 'name': name, 'arguments': args})}\n\n"

                        if not tool_calls:
                            if not yielded_content:
                                yield f"data: {json.dumps({'type': 'content', 'text': '(cevap uretilemedi)'})}\n\n"
                            yield f"data: [DONE]\n\n"
                            return

                        assistant_content = "".join(content_parts) if content_parts else None
                        assistant_msg = {"role": "assistant", "content": assistant_content or ""}

                        if tool_calls:
                            assistant_msg["tool_calls"] = [
                                {"function": {
                                    "name": tc["name"],
                                    "arguments": tc["arguments"],
                                }}
                                for tc in tool_calls
                            ]

                        current_messages.append(assistant_msg)

                        for tc in tool_calls:
                            try:
                                result = await asyncio.get_event_loop().run_in_executor(None, execute_tool, tc["name"], tc["arguments"])
                            except Exception as tool_err:
                                result = json.dumps({"error": f"Tool hatasi: {str(tool_err)[:200]}"}, ensure_ascii=False)
                            current_messages.append({
                                "role": "tool",
                                "name": tc["name"],
                                "content": result,
                            })
                            if show_tool_calls:
                                try:
                                    result_parsed = json.loads(result)
                                except (json.JSONDecodeError, TypeError):
                                    result_parsed = {"raw": result[:200]}
                                yield f"data: {json.dumps({'type': 'tool_result', 'name': tc['name'], 'result': result_parsed})}\n\n"

                        tool_round += 1

                except httpx.ConnectError:
                    yield f"data: {json.dumps({'error': 'Ollama calismiyor. Servisi baslatmayi dene: ollama serve'})}\n\n"
                    yield f"data: [DONE]\n\n"
                    return
                except Exception as e:
                    yield f"data: {json.dumps({'error': str(e)[:200]})}\n\n"
                    yield f"data: [DONE]\n\n"
                    return

        yield f"data: {json.dumps({'type': 'info', 'text': 'Maksimum tool turuna ulasildi.'})}\n\n"
        yield f"data: [DONE]\n\n"

    return StreamingResponse(agent_loop(), media_type="text/event-stream")
