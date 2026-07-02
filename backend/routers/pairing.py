import os
import json
import time
import secrets
import socket
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends, Request, status
from dependencies import require_auth
from auth import create_access_token
import psutil

router = APIRouter(tags=["pairing"])

CONFIG_PATH = Path(__file__).parent.parent / "config.json"

_active_pairing_token = {
    "token": "",
    "expires_at": 0
}

_zeroconf = None
_zeroconf_info = None


def _load_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text())
        except Exception:
            pass
    return {}


def _save_config(cfg: dict):
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2, ensure_ascii=False))


def get_ip_addresses():
    ips = []
    # Primary outgoing IP
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ips.append(s.getsockname()[0])
        s.close()
    except Exception:
        pass

    # All interfaces
    try:
        for _, addrs in psutil.net_if_addrs().items():
            for addr in addrs:
                if addr.family == socket.AF_INET:
                    ip = addr.address
                    if ip not in ips and not ip.startswith("127."):
                        ips.append(ip)
    except Exception:
        pass
    return ips


def start_mdns(port: int = 8081):
    global _zeroconf, _zeroconf_info
    try:
        from zeroconf import Zeroconf, ServiceInfo
        
        ips = get_ip_addresses()
        local_ip = ips[0] if ips else "127.0.0.1"
        hostname = socket.gethostname()
        desc = {"path": "/api/version"}
        
        _zeroconf_info = ServiceInfo(
            "_pcmanager._tcp.local.",
            f"{hostname}._pcmanager._tcp.local.",
            addresses=[socket.inet_aton(local_ip)],
            port=port,
            properties=desc,
            server=f"{hostname}.local.",
        )
        _zeroconf = Zeroconf()
        _zeroconf.register_service(_zeroconf_info)
        print(f"[mDNS] Registered service: {hostname}._pcmanager._tcp.local. on {local_ip}:{port}")
    except Exception as e:
        print(f"[mDNS Error] Could not start zeroconf: {e}")


def stop_mdns():
    global _zeroconf, _zeroconf_info
    if _zeroconf:
        try:
            _zeroconf.unregister_service(_zeroconf_info)
            _zeroconf.close()
            print("[mDNS] Unregistered service.")
        except Exception as e:
            print(f"[mDNS Error] Could not stop zeroconf: {e}")


@router.get("/pairing/qr")
def get_pairing_info(request: Request):
    global _active_pairing_token
    now = time.time()
    
    # Generate token if expired or missing
    if not _active_pairing_token["token"] or now > _active_pairing_token["expires_at"]:
        # 6 digit numeric code
        token = "".join(secrets.choice("0123456789") for _ in range(6))
        _active_pairing_token = {
            "token": token,
            "expires_at": now + 300  # 5 minutes validity
        }
    
    cfg = _load_config()
    site_name = cfg.get("setup", {}).get("site_name", "PC Manager")
    ips = get_ip_addresses()
    
    port = request.url.port or 8081
    
    return {
        "local_ips": ips,
        "tailscale_ip": next((ip for ip in ips if ip.startswith("100.")), None),
        "port": port,
        "pairing_token": _active_pairing_token["token"],
        "expires_in": int(_active_pairing_token["expires_at"] - now),
        "site_name": site_name,
        "hostname": socket.gethostname()
    }


@router.post("/pairing/pair")
def pair_device(body: dict):
    global _active_pairing_token
    token = body.get("token")
    device_id = body.get("device_id")
    device_name = body.get("device_name", "Mobil Cihaz")
    
    if not token or not device_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "token ve device_id zorunludur")
        
    now = time.time()
    if token != _active_pairing_token["token"] or now > _active_pairing_token["expires_at"]:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Eşleştirme kodu geçersiz veya süresi dolmuş")
        
    # Invalidate token after successful pairing
    _active_pairing_token = {"token": "", "expires_at": 0}
    
    cfg = _load_config()
    if "paired_devices" not in cfg:
        cfg["paired_devices"] = []
        
    # Remove existing pairing with same device_id
    cfg["paired_devices"] = [d for d in cfg["paired_devices"] if d.get("device_id") != device_id]
    
    cfg["paired_devices"].append({
        "device_id": device_id,
        "device_name": device_name,
        "paired_at": int(now)
    })
    _save_config(cfg)
    
    # Generate mobile token (expires in 10 years)
    access_token = create_access_token({
        "sub": "mobile_client",
        "device_id": device_id
    })
    
    return {
        "success": True,
        "token": access_token,
        "device_name": device_name
    }


@router.get("/pairing/devices")
def list_devices(_: dict = Depends(require_auth)):
    cfg = _load_config()
    return cfg.get("paired_devices", [])


@router.delete("/pairing/devices/{device_id}")
def revoke_device(device_id: str, _: dict = Depends(require_auth)):
    cfg = _load_config()
    if "paired_devices" in cfg:
        original_len = len(cfg["paired_devices"])
        cfg["paired_devices"] = [d for d in cfg["paired_devices"] if d.get("device_id") != device_id]
        if len(cfg["paired_devices"]) < original_len:
            _save_config(cfg)
            return {"success": True, "message": f"{device_id} cihazının yetkisi kaldırıldı"}
    raise HTTPException(status.HTTP_404_NOT_FOUND, "Cihaz bulunamadı")
