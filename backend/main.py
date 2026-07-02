import os
import json
import time as time_module
from pathlib import Path
from fastapi import FastAPI, HTTPException, Depends, Request
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
    playbooks, pairing,
)
from dependencies import require_auth
from routers.search_engine import _rewrite_html, _fetch_page
from fastapi.responses import HTMLResponse, PlainTextResponse, Response
from fastapi import Query
from urllib.parse import urlparse
import httpx

app = FastAPI(title="PC Manager", version=VERSION, description="Sistem yönetimi ve OSINT platformu")

@app.on_event("startup")
def startup_event():
    # Start mDNS announcer on port 8081
    pairing.start_mdns(port=8081)

@app.on_event("shutdown")
def shutdown_event():
    # Stop mDNS announcer
    pairing.stop_mdns()

notifications.start_checker()

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
app.include_router(cron.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(deprem.router, prefix="/api")
app.include_router(ollama.router, prefix="/api")
app.include_router(settings.router, prefix="/api")
app.include_router(pairing.router, prefix="/api")
app.include_router(debug.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(debug_agent.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(search_engine.router, prefix="/api", dependencies=[Depends(require_auth)])


@app.get("/api/proxy/page")
def proxy_page(url: str = Query("", description="Açılacak URL")):
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

@app.get("/")
def serve_index():
    index = static_dir / "index.html"
    if index.exists():
        return FileResponse(str(index))
    raise HTTPException(404)

@app.get("/{full_path:path}")
def serve_frontend(full_path: str):
    file_path = static_dir / full_path
    if file_path.exists() and file_path.is_file():
        return FileResponse(str(file_path))
    index = static_dir / "index.html"
    if index.exists():
        return FileResponse(str(index))
    raise HTTPException(404)

if __name__ == "__main__":
    import uvicorn
    tailscale_ip = os.environ.get("TAILSCALE_IP", "")
    host = "0.0.0.0"
    urls = [f"http://localhost:8081"]
    if tailscale_ip:
        urls.append(f"http://{tailscale_ip}:8081")
    print(f"PC Manager baslatiliyor: {' - '.join(urls)}")
    uvicorn.run(app, host=host, port=8081, log_level="info")
