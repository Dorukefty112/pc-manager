"""Uzak sunucular: diğer PC Manager kurulumlarını tek panelden izleme ve
terminalden SSH ile bağlanma hedefleri.

Kayıtlar config.json'daki "remote_hosts" listesinde durur. API token'ları
yalnızca sunucu tarafında tutulur, istemciye hiçbir zaman geri gönderilmez.
"""
import re
import json
import time
import uuid
import asyncio
import httpx
from pathlib import Path
from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["hosts"])
CONFIG_PATH = Path(__file__).parent.parent / "config.json"
SSH_RE = re.compile(r"^[A-Za-z0-9_.-]+@?[A-Za-z0-9_.:-]*$")


def _load_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return {}


def _save_hosts(hosts: list[dict]):
    cfg = _load_config()
    cfg["remote_hosts"] = hosts
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2, ensure_ascii=False))


def get_hosts() -> list[dict]:
    return _load_config().get("remote_hosts", [])


def public_host(h: dict) -> dict:
    return {
        "id": h["id"],
        "name": h.get("name", ""),
        "url": h.get("url", ""),
        "ssh": h.get("ssh", ""),
        "ssh_port": h.get("ssh_port"),
        "has_token": bool(h.get("token")),
    }


def validate_host(body: dict, existing: dict | None = None) -> dict:
    name = (body.get("name") or "").strip()[:60]
    if not name:
        raise ValueError("Sunucu adı gerekli")
    url = (body.get("url") or "").strip().rstrip("/")
    if url and not url.startswith(("http://", "https://")):
        raise ValueError("Adres http:// veya https:// ile başlamalı")
    ssh = (body.get("ssh") or "").strip()
    if ssh and (not SSH_RE.match(ssh) or ssh.startswith("-")):
        raise ValueError("SSH hedefi kullanici@adres biçiminde olmalı")
    port = body.get("ssh_port")
    if port in ("", None):
        port = None
    else:
        port = int(port)
        if not 1 <= port <= 65535:
            raise ValueError("Geçersiz SSH portu")
    if not url and not ssh:
        raise ValueError("Adres veya SSH hedefinden en az biri gerekli")
    token = body.get("token")
    if token is None and existing:
        token = existing.get("token", "")
    return {
        "id": existing["id"] if existing else uuid.uuid4().hex[:10],
        "name": name,
        "url": url,
        "token": (token or "").strip(),
        "ssh": ssh,
        "ssh_port": port,
    }


def _host_or_404(host_id: str) -> dict:
    h = next((h for h in get_hosts() if h["id"] == host_id), None)
    if not h:
        raise HTTPException(404, "Sunucu bulunamadı")
    return h


@router.get("/hosts")
def list_hosts():
    return [public_host(h) for h in get_hosts()]


@router.post("/hosts")
def create_host(body: dict):
    try:
        host = validate_host(body)
    except (ValueError, TypeError) as e:
        raise HTTPException(400, str(e))
    _save_hosts(get_hosts() + [host])
    return public_host(host)


@router.put("/hosts/{host_id}")
def update_host(host_id: str, body: dict):
    existing = _host_or_404(host_id)
    try:
        host = validate_host(body, existing)
    except (ValueError, TypeError) as e:
        raise HTTPException(400, str(e))
    _save_hosts([host if h["id"] == host_id else h for h in get_hosts()])
    return public_host(host)


@router.delete("/hosts/{host_id}")
def delete_host(host_id: str):
    _host_or_404(host_id)
    _save_hosts([h for h in get_hosts() if h["id"] != host_id])
    return {"success": True}


async def _probe(client: httpx.AsyncClient, host: dict) -> dict:
    base = {"id": host["id"]}
    if not host.get("url"):
        return {**base, "online": None, "error": "Yalnızca SSH"}
    if not host.get("token"):
        return {**base, "online": None, "error": "API token girilmemiş"}
    start = time.perf_counter()
    try:
        resp = await client.get(f"{host['url']}/api/system/stats",
                                headers={"Authorization": f"Bearer {host['token']}"})
    except httpx.HTTPError as e:
        return {**base, "online": False, "error": type(e).__name__}
    latency = round((time.perf_counter() - start) * 1000)
    if resp.status_code == 401:
        return {**base, "online": True, "latency_ms": latency, "error": "Token geçersiz veya iptal edilmiş"}
    if resp.status_code != 200:
        return {**base, "online": True, "latency_ms": latency, "error": f"HTTP {resp.status_code}"}
    try:
        s = resp.json()
    except ValueError:
        return {**base, "online": True, "latency_ms": latency, "error": "Geçersiz yanıt"}
    return {
        **base,
        "online": True,
        "latency_ms": latency,
        "hostname": s.get("hostname"),
        "os": s.get("os"),
        "cpu": s.get("cpu", {}).get("percent"),
        "memory": s.get("memory", {}).get("percent"),
        "disk": s.get("disk", {}).get("percent"),
        "uptime": s.get("uptime"),
    }


@router.get("/hosts/status")
async def hosts_status():
    hosts = get_hosts()
    async with httpx.AsyncClient(timeout=6, verify=True) as client:
        return await asyncio.gather(*[_probe(client, h) for h in hosts])
