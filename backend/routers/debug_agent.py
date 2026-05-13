import os
import re
import json
import time
import shutil
import subprocess
import hashlib
from pathlib import Path
from datetime import datetime
from fastapi import APIRouter, HTTPException
import httpx

router = APIRouter(tags=["debug_agent"])

BASE_DIR = Path(__file__).parent.parent.parent
GIT_DIR = BASE_DIR / ".git"
CHECKPOINT_DIR = Path("/tmp/pcmanager_debug_checkpoints")
OLLAMA_URL = "http://localhost:11434/api/chat"
DEFAULT_MODEL = "gemma4:e4b"

CODE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Bir dosyanin icerigini oku",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "BASE_DIR e gore dosya yolu (orn: backend/main.py)"}
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Bir dosyaya yaz veya var olani guncelle. DEGISIKLIK YAPMADAN ONCE kullanicidan onay AL.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "BASE_DIR e gore dosya yolu"},
                    "content": {"type": "string", "description": "yeni dosya icerigi"},
                },
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_files",
            "description": "Bir dizindeki dosyalari listele",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "BASE_DIR e gore dizin yolu (bos=kok)"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_code",
            "description": "Kod tabaninda regex ile ara",
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "description": "aranacak regex pattern"},
                    "include": {"type": "string", "description": "dosya patterni (orn: *.py, *.jsx)"},
                },
                "required": ["pattern"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "exec_command",
            "description": "Shell komutu calistir. Orn: python -m pytest, npm run lint",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "calistirilacak komut"},
                },
                "required": ["command"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "git_diff",
            "description": "Henuz commit edilmemis degisiklikleri goster",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
]

CHECKPOINT_SYSTEM_PROMPT = (
    "Sen PC Manager debug asistanisin. GOREVIN: kod tabanindaki hatalari bulup cozmek. "
    "Cok dikkatli ol, yanlis duzeltme yapmaktansa hic duzeltme yapmamak daha iyidir. "
    "Once kodu iyice analiz et, sonra duzelt. "
    "Turkce cevap ver. Her adimda ne yaptigini acikla."
)

ANALYZE_SYSTEM_PROMPT = (
    "Sen PC Manager debug asistanisin. Kodu analiz et ve potansiyel hatalari, "
    "guvenlik aciklarini, performans sorunlarini ve kod kokularini bul. "
    "Turkce cevap ver. Buldugun her sorunu: "
    "- Dosya yolu ve satir numarasi "
    "- Sorunun aciklamasi "
    "- Cozum onerisi "
    "- Kritiklik seviyesi (Yuksek/Orta/Dusuk) "
    "seklinde raporla."
)


def _ensure_git():
    if not GIT_DIR.exists():
        subprocess.run(["git", "init"], cwd=str(BASE_DIR), capture_output=True)
        gitignore = BASE_DIR / ".gitignore"
        if not gitignore.exists():
            gitignore.write_text(
                "node_modules/\n__pycache__/\n*.pyc\n.venv/\nvenv/\n"
                "config.json\n.env\n*.log\n"
            )
        subprocess.run(["git", "add", "-A"], cwd=str(BASE_DIR), capture_output=True)
        subprocess.run(
            ["git", "commit", "-m", "initial checkpoint"],
            cwd=str(BASE_DIR), capture_output=True,
            env={**os.environ, "GIT_AUTHOR_NAME": "pcmanager",
                 "GIT_AUTHOR_EMAIL": "pcmanager@local",
                 "GIT_COMMITTER_NAME": "pcmanager",
                 "GIT_COMMITTER_EMAIL": "pcmanager@local"},
        )


def _create_checkpoint(label: str) -> str:
    _ensure_git()
    checkpoint_id = hashlib.sha256(f"{time.time()}{label}".encode()).hexdigest()[:12]
    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    subprocess.run(
        ["git", "add", "-A"],
        cwd=str(BASE_DIR), capture_output=True,
    )
    result = subprocess.run(
        ["git", "commit", "-m", f"checkpoint_{ts}_{label}"],
        cwd=str(BASE_DIR), capture_output=True, text=True,
        env={**os.environ, "GIT_AUTHOR_NAME": "pcmanager",
             "GIT_AUTHOR_EMAIL": "pcmanager@local",
             "GIT_COMMITTER_NAME": "pcmanager",
             "GIT_COMMITTER_EMAIL": "pcmanager@local"},
    )
    commit_hash = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=str(BASE_DIR), capture_output=True, text=True,
    ).stdout.strip()

    info = {
        "id": checkpoint_id,
        "label": label,
        "timestamp": ts,
        "commit": commit_hash,
        "message": result.stdout.strip(),
    }
    (CHECKPOINT_DIR / f"{checkpoint_id}.json").write_text(json.dumps(info, indent=2))
    return checkpoint_id


def _execute_code_tool(name: str, args: dict) -> str:
    try:
        if name == "read_file":
            path = args.get("path", "")
            full = BASE_DIR / path
            if not full.exists():
                return json.dumps({"error": f"Dosya bulunamadi: {path}"})
            content = full.read_text(encoding="utf-8", errors="replace")
            return json.dumps({"path": path, "content": content[:8000], "truncated": len(content) > 8000})
        elif name == "write_file":
            path = args.get("path", "")
            content = args.get("content", "")
            full = BASE_DIR / path
            full.parent.mkdir(parents=True, exist_ok=True)
            full.write_text(content, encoding="utf-8")
            return json.dumps({"success": True, "path": path, "bytes": len(content)})
        elif name == "list_files":
            path = args.get("path", "")
            full = BASE_DIR / path if path else BASE_DIR
            if not full.is_dir():
                return json.dumps({"error": f"Dizin bulunamadi: {path}"})
            entries = []
            for e in sorted(full.iterdir()):
                entries.append({"name": e.name, "type": "dir" if e.is_dir() else "file",
                                "size": e.stat().st_size if e.is_file() else 0})
            return json.dumps(entries[:100])
        elif name == "search_code":
            pattern = args.get("pattern", "")
            include = args.get("include", "*")
            try:
                result = subprocess.run(
                    ["rg", "-n", pattern, "--include", include, "-l"],
                    cwd=str(BASE_DIR), capture_output=True, text=True, timeout=10
                )
                files = [l for l in result.stdout.strip().split("\n") if l.strip()][:20]
                return json.dumps({"matches": files, "count": len(files)})
            except Exception as e:
                return json.dumps({"error": str(e)})
        elif name == "exec_command":
            cmd = args.get("command", "")
            result = subprocess.run(
                cmd, shell=True, capture_output=True, text=True, timeout=30,
                cwd=str(BASE_DIR),
            )
            return json.dumps({
                "exit_code": result.returncode,
                "stdout": result.stdout[:2000],
                "stderr": result.stderr[:1000],
            })
        elif name == "git_diff":
            result = subprocess.run(
                ["git", "diff"],
                cwd=str(BASE_DIR), capture_output=True, text=True, timeout=5
            )
            staged = subprocess.run(
                ["git", "diff", "--cached"],
                cwd=str(BASE_DIR), capture_output=True, text=True, timeout=5
            )
            diff = result.stdout[:3000] + staged.stdout[:2000]
            return json.dumps({"diff": diff[:5000]})
        return json.dumps({"error": f"bilinmeyen tool: {name}"})
    except Exception as e:
        return json.dumps({"error": str(e)})


def _call_ollama(messages: list, tools: list = None, max_rounds: int = 5) -> dict:
    current = [{"role": "system", "content": ANALYZE_SYSTEM_PROMPT}] + messages
    for _ in range(max_rounds):
        payload = {
            "model": DEFAULT_MODEL,
            "messages": current,
            "stream": False,
        }
        if tools:
            payload["tools"] = tools

        try:
            resp = httpx.post(OLLAMA_URL, json=payload, timeout=120)
            if resp.status_code != 200:
                return {"error": f"Ollama hatasi: {resp.text[:200]}"}
            data = resp.json()
        except Exception as e:
            return {"error": f"Ollama baglanti hatasi: {str(e)}"}

        msg = data.get("message", {})

        if not tools or "tool_calls" not in msg or not msg["tool_calls"]:
            return {"response": msg.get("content", "")}

        content = msg.get("content", "") or ""
        assistant_msg = {"role": "assistant", "content": content, "tool_calls": msg["tool_calls"]}
        current.append(assistant_msg)

        for tc in msg["tool_calls"]:
            fn = tc.get("function", {})
            name = fn.get("name", "")
            args = fn.get("arguments", {})
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except json.JSONDecodeError:
                    args = {}
            result = _execute_code_tool(name, args)
            current.append({"role": "tool", "name": name, "content": result})
            assistant_msg.setdefault("tool_calls_called", []).append({"name": name, "result": result[:200]})

    return {"response": "Maksimum tur sayisina ulasildi.", "tool_calls": True}


@router.post("/debug/agent/check")
def debug_agent_check(body: dict = {}):
    target = body.get("target", "")
    prompt = "Kod tabanini analiz et ve hatalari bul."
    if target:
        prompt += f" Odaklanilacak alan: {target}"

    result = _call_ollama([{"role": "user", "content": prompt}], tools=CODE_TOOLS)
    return result


@router.post("/debug/agent/fix")
def debug_agent_fix(body: dict):
    issue = body.get("issue", "")
    if not issue:
        raise HTTPException(400, "issue alani gerekli")

    cpid = _create_checkpoint(f"fix_before_{issue[:40]}")

    result = _call_ollama(
        [{"role": "user",
          "content": f"Su sorunu coz: {issue}\n\nOnce cozumu analiz et, sonra gerekli dosyalari duzenle."}],
        tools=CODE_TOOLS, max_rounds=8,
    )

    return {
        "checkpoint_id": cpid,
        "result": result,
    }


@router.post("/debug/agent/rollback/{checkpoint_id}")
def debug_agent_rollback(checkpoint_id: str):
    cp_file = CHECKPOINT_DIR / f"{checkpoint_id}.json"
    if not cp_file.exists():
        checkpoints = sorted(CHECKPOINT_DIR.glob("*.json"), key=os.path.getmtime, reverse=True)
        if not checkpoints:
            raise HTTPException(400, "Geri alinacak checkpoint bulunamadi")
        cp_file = checkpoints[0]

    info = json.loads(cp_file.read_text())
    commit = info.get("commit", "")
    if not commit:
        raise HTTPException(400, "Checkpoint gecersiz")

    _ensure_git()
    result = subprocess.run(
        ["git", "reset", "--hard", commit],
        cwd=str(BASE_DIR), capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise HTTPException(500, f"Geri alma basarisiz: {result.stderr[:200]}")

    return {"success": True, "rolled_back_to": info}


@router.get("/debug/agent/checkpoints")
def debug_agent_checkpoints():
    checkpoints = []
    for f in sorted(CHECKPOINT_DIR.glob("*.json"), key=os.path.getmtime, reverse=True):
        checkpoints.append(json.loads(f.read_text()))
    return {"checkpoints": checkpoints}


@router.get("/debug/agent/status")
def debug_agent_status():
    _ensure_git()
    has_uncommitted = False
    diff = ""
    try:
        r = subprocess.run(["git", "status", "--porcelain"],
                           cwd=str(BASE_DIR), capture_output=True, text=True)
        has_uncommitted = bool(r.stdout.strip())
        if has_uncommitted:
            r2 = subprocess.run(["git", "diff", "--stat"],
                                cwd=str(BASE_DIR), capture_output=True, text=True)
            diff = r2.stdout.strip()
    except Exception:
        pass
    return {
        "has_uncommitted_changes": has_uncommitted,
        "changes": diff,
        "base_dir": str(BASE_DIR),
        "has_git": GIT_DIR.exists(),
    }
