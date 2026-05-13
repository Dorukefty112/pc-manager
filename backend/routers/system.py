import asyncio
import json
import psutil
import shutil
import time
from collections import deque
from urllib.parse import parse_qs
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from dependencies import require_auth
from auth import verify_token

_cpu_history = deque(maxlen=60)
_mem_history = deque(maxlen=60)
_last_cpu_poll = 0

router = APIRouter(tags=["system"])

@router.get("/system/stats")
def get_system_stats(_: dict = Depends(require_auth)):
    cpu_percent = psutil.cpu_percent(interval=0.5)
    cpu_count = psutil.cpu_count()
    cpu_freq = psutil.cpu_freq()
    mem = psutil.virtual_memory()
    disk = shutil.disk_usage("/")
    temps = []
    for name, entries in psutil.sensors_temperatures().items():
        for entry in entries:
            temps.append({"sensor": name, "label": entry.label or name, "current": entry.current, "high": entry.high, "critical": entry.critical})
    net = psutil.net_io_counters()
    return {
        "cpu": {
            "percent": cpu_percent,
            "count": cpu_count,
            "freq": {"current": cpu_freq.current, "max": cpu_freq.max} if cpu_freq else None
        },
        "memory": {"total": mem.total, "used": mem.used, "percent": mem.percent},
        "disk": {"total": disk.total, "used": disk.used, "free": disk.free, "percent": disk.used / disk.total * 100},
        "temp": temps,
        "uptime": psutil.boot_time(),
        "hostname": __import__("socket").gethostname(),
        "os": f"{__import__('platform').system()} {__import__('platform').release()}"
    }

@router.get("/system/stats/history")
def get_stats_history(_: dict = Depends(require_auth)):
    global _last_cpu_poll
    now = time.time()
    if now - _last_cpu_poll >= 1 or not _cpu_history:
        cpu = psutil.cpu_percent(interval=0)
        mem = psutil.virtual_memory().percent
        _cpu_history.append({"time": now, "value": cpu})
        _mem_history.append({"time": now, "value": mem})
        _last_cpu_poll = now
    return {
        "cpu": list(_cpu_history),
        "memory": list(_mem_history),
    }

@router.websocket("/system/ws")
async def system_websocket(websocket: WebSocket, token: str = Query("")):
    token = token or parse_qs(websocket.url.query).get("token", [None])[0]
    if not token:
        await websocket.close(code=4001, reason="Token gerekli")
        return
    try:
        verify_token(token)
    except Exception:
        await websocket.close(code=4001, reason="Geçersiz token")
        return

    await websocket.accept()
    try:
        while True:
            cpu = psutil.cpu_percent(interval=0)
            mem = psutil.virtual_memory().percent
            disk = shutil.disk_usage("/")
            net = psutil.net_io_counters()
            data = json.dumps({
                "cpu": cpu,
                "memory": mem,
                "disk": disk.used / disk.total * 100,
                "uptime": psutil.boot_time(),
            })
            await websocket.send_text(data)
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        pass
