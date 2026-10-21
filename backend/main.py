import os
import json
import threading
import time as time_module
from pathlib import Path
from fastapi import FastAPI, HTTPException, Depends, Request, Header
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

VERSION = (Path(__file__).parent.parent / "VERSION").read_text().strip()
from routers import (
    system, files, power, terminal, processes,
    network, system_info, disks, updates, logs,
    services, chat, pentest, auth as auth_router,
    docker, cron, deprem, ollama, telegram,
    settings, debug, debug_agent, search_engine,
    notifications, windows, speedtest, firewall, firewall_native, temperature,
    playbooks, pairing, yangin, sel, hava_uyari, users, metrics, backups, hosts,
)
from contextlib import asynccontextmanager
from dependencies import require_auth, authenticate_header, check_role
from auth import verify_token
from routers.search_engine import _rewrite_html, _fetch_page
from fastapi.responses import HTMLResponse, PlainTextResponse, Response
from fastapi import Query
from urllib.parse import urlparse
import httpx


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Arka plan işleri yalnızca sunucu gerçekten başlarken çalışır;
    # testlerde main'i import etmek thread başlatmaz.
    # mDNS kaydı birkaç saniye sürebilir; açılışı bekletmesin
    _port = int(os.environ.get("PCMANAGER_PORT", "8081"))
    threading.Thread(target=pairing.start_mdns, kwargs={"port": _port}, daemon=True).start()
    notifications.start_checker()
    yangin.start_fire_checker()
    sel.start_flood_checker()
    hava_uyari.start_weather_checker()
    metrics.start_sampler()
    backups.start_scheduler()
    yield
    backups.stop_scheduler()
    metrics.stop_sampler()
    notifications.stop_checker()
    pairing.stop_mdns()


app = FastAPI(title="PC Manager", version=VERSION, description="Sistem yönetimi platformu", lifespan=lifespan)

static_dir = Path(__file__).parent.parent / "frontend" / "dist"
if not static_dir.exists():
    static_dir = Path(__file__).parent.parent / "frontend"

assets_dir = static_dir / "assets"
if assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")


@app.middleware("http")
async def debug_middleware(request: Request, call_next):
    cfg_path = Path(__file__).parent / "config.json"
    debug_enabled = False
    try:
        if cfg_path.exists():
            cfg = json.loads(cfg_path.read_text())
            debug_enabled = cfg.get("debug", {}).get("enabled", False)
    except Exception:
        pass

    if not debug_enabled or not request.url.path.startswith("/api/"):
        return await call_next(request)

    start = time_module.time()
    try:
        response = await call_next(request)
        elapsed = time_module.time() - start
        if elapsed > 0.5:
            print(f"[DEBUG] SLOW {request.method} {request.url.path} - {round(elapsed*1000)}ms")
        return response
    except Exception as exc:
        elapsed = time_module.time() - start
        print(f"[DEBUG] ERROR {request.method} {request.url.path} - {str(exc)[:100]}")
        return JSONResponse(
            {"error": str(exc), "debug": {
                "method": request.method, "path": request.url.path,
                "elapsed_ms": round(elapsed * 1000),
            }},
            status_code=500,
        )


app.include_router(auth_router.router, prefix="/api")

@app.get("/api/version")
def get_version():
    return {"version": VERSION, "name": "PC Manager"}

app.include_router(system.router, prefix="/api")
app.include_router(files.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(power.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(terminal.router, prefix="/api")
app.include_router(processes.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(network.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(system_info.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(disks.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(updates.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(logs.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(services.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(chat.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(pentest.router, prefix="/api")
app.include_router(docker.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(docker.ws_router, prefix="/api")
app.include_router(cron.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(deprem.router, prefix="/api")
app.include_router(yangin.router, prefix="/api")
app.include_router(sel.router, prefix="/api")
app.include_router(hava_uyari.router, prefix="/api")
app.include_router(ollama.router, prefix="/api")
app.include_router(settings.router, prefix="/api")
app.include_router(pairing.router, prefix="/api")
app.include_router(debug.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(debug_agent.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(search_engine.router, prefix="/api", dependencies=[Depends(require_auth)])


@app.get("/api/proxy/page")
def proxy_page(
    url: str = Query("", description="Açılacak URL"),
    token: str = Query("", description="iframe Authorization başlığı gönderemediği için JWT"),
    authorization: str = Header(None),
):
    payload = verify_token(token) if token else authenticate_header(authorization)
    check_role(payload, "GET", "/api/proxy/page")
    if not url.strip():
        raise HTTPException(400, "URL gerekli")
    try:
        resp = _fetch_page(url)
        content_type = resp.headers.get("content-type", "").lower()
        if "text/html" in content_type or "application/xhtml" in content_type:
            modified = _rewrite_html(resp.text, str(url))
            return HTMLResponse(modified)
        if any(x in content_type for x in ("xml", "json", "text/", "application/javascript")):
            body = resp.content[:1024 * 100]
            return Response(
                content=body,
                media_type=content_type.split(";")[0].strip() or "text/plain; charset=utf-8",
                headers={k: v for k, v in resp.headers.items() if k.lower() in ("content-type", "content-encoding")},
            )
        body = resp.content[:1024 * 50]
        return PlainTextResponse(
            body.decode("utf-8", errors="replace") if isinstance(body, bytes) else body,
            media_type="text/plain; charset=utf-8",
        )
    except httpx.TimeoutException:
        raise HTTPException(504, "Sayfa zaman aşımı")
    except Exception as e:
        raise HTTPException(502, f"Proxy hatası: {str(e)[:150]}")


app.include_router(telegram.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(notifications.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(windows.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(speedtest.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(firewall.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(firewall_native.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(temperature.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(playbooks.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(metrics.router, prefix="/api")
app.include_router(backups.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(hosts.router, prefix="/api", dependencies=[Depends(require_auth)])

@app.get("/")
def serve_index():
    index = static_dir / "index.html"
    if index.exists():
        return FileResponse(str(index))
    raise HTTPException(404)

@app.get("/{full_path:path}")
def serve_frontend(full_path: str):
    # %2F ile kodlanmış '..' parçaları route'a çözülmüş olarak gelir; çözümlenen
    # yol static_dir dışına çıkıyorsa dosya olarak sunma (config.json, .jwt_secret...)
    if full_path == "api" or full_path.startswith("api/"):
        raise HTTPException(404, "API uç noktası bulunamadı")
    root = static_dir.resolve()
    file_path = (root / full_path).resolve()
    if file_path.is_relative_to(root) and file_path.is_file():
        return FileResponse(str(file_path))
    index = static_dir / "index.html"
    if index.exists():
        return FileResponse(str(index))
    raise HTTPException(404)

if __name__ == "__main__":
    import uvicorn
    tailscale_ip = os.environ.get("TAILSCALE_IP", "")
    host = os.environ.get("PCMANAGER_HOST", "0.0.0.0")
    port = int(os.environ.get("PCMANAGER_PORT", "8081"))
    urls = [f"http://localhost:{port}"]
    if tailscale_ip:
        urls.append(f"http://{tailscale_ip}:{port}")
    print(f"PC Manager baslatiliyor: {' - '.join(urls)}")
    uvicorn.run(app, host=host, port=port, log_level="info")
