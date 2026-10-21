import os
import shutil
import subprocess
from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["power"])

# Termux/Android ortamında root varsa güç komutları `su -c` ile çalıştırılır.
# Root yoksa bu işlemler kullanılamaz; kullanıcıya anlaşılır bir hata döner.
IS_TERMUX = "com.termux" in os.environ.get("PREFIX", "")


def _su_available() -> bool:
    return shutil.which("su") is not None


def run_cmd(cmd, needs_root=True):
    """Komutu doğrudan çalıştırır; izin reddedilirse ve root varsa `su -c` ile yeniden dener."""
    def _run(final):
        subprocess.run(final, check=True, timeout=10)

    try:
        _run(cmd)
        return {"success": True}
    except FileNotFoundError:
        # Komut yok (ör. Termux'ta systemctl). Root ile kabuktan denemeye değer.
        pass
    except subprocess.TimeoutExpired:
        raise HTTPException(500, "Komut zaman aşımına uğradı")
    except subprocess.CalledProcessError:
        # Büyük olasılıkla yetki hatası; aşağıda root ile denenir.
        pass

    if needs_root and _su_available():
        try:
            subprocess.run(["su", "-c", " ".join(cmd)], check=True, timeout=10)
            return {"success": True}
        except subprocess.TimeoutExpired:
            raise HTTPException(500, "Komut zaman aşımına uğradı")
        except subprocess.CalledProcessError as e:
            raise HTTPException(500, f"Root ile çalıştırılamadı: {e}")
        except FileNotFoundError:
            pass

    hint = " (bu cihazda root yok)" if IS_TERMUX and not _su_available() else ""
    raise HTTPException(501, f"Bu işlem bu sistemde kullanılamıyor{hint}")


@router.post("/power/shutdown")
def shutdown():
    return run_cmd(["poweroff"])


@router.post("/power/reboot")
def reboot():
    return run_cmd(["reboot"])


@router.post("/power/suspend")
def suspend():
    # Android'de ekranı kapatmak uykuya en yakın eşdeğerdir
    if IS_TERMUX:
        return run_cmd(["input", "keyevent", "26"])
    return run_cmd(["systemctl", "suspend"])


@router.post("/power/logout")
def logout():
    return run_cmd(["loginctl", "terminate-user", os.getenv("USER", "kullanici")])


# ─── Wake-on-LAN ──────────────────────────────────────────────────────────────
import re
import json
import uuid
import socket
from pathlib import Path

CONFIG_PATH = Path(__file__).parent.parent / "config.json"
_MAC_RE = re.compile(r"^([0-9A-Fa-f]{2})([-:]?)([0-9A-Fa-f]{2})(\2[0-9A-Fa-f]{2}){4}$")


def normalize_mac(mac: str) -> str:
    mac = (mac or "").strip()
    if not _MAC_RE.match(mac):
        raise ValueError("Geçersiz MAC adresi (örn. AA:BB:CC:DD:EE:FF)")
    digits = re.sub(r"[^0-9A-Fa-f]", "", mac).upper()
    return ":".join(digits[i:i + 2] for i in range(0, 12, 2))


def magic_packet(mac: str) -> bytes:
    raw = bytes.fromhex(normalize_mac(mac).replace(":", ""))
    return b"\xff" * 6 + raw * 16


def send_magic_packet(mac: str, broadcast: str = "255.255.255.255", port: int = 9):
    packet = magic_packet(mac)
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        s.sendto(packet, (broadcast, port))


def _load_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return {}


def _devices() -> list[dict]:
    return _load_config().get("wol_devices", [])


def _save_devices(devices: list[dict]):
    cfg = _load_config()
    cfg["wol_devices"] = devices
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2, ensure_ascii=False))


def _validate_device(body: dict) -> dict:
    name = (body.get("name") or "").strip()[:60]
    if not name:
        raise ValueError("Cihaz adı gerekli")
    broadcast = (body.get("broadcast") or "255.255.255.255").strip()
    try:
        socket.inet_aton(broadcast)
    except OSError:
        raise ValueError("Geçersiz yayın (broadcast) adresi")
    port = int(body.get("port") or 9)
    if not 1 <= port <= 65535:
        raise ValueError("Geçersiz port")
    return {"id": uuid.uuid4().hex[:10], "name": name, "mac": normalize_mac(body.get("mac", "")),
            "broadcast": broadcast, "port": port}


@router.get("/power/wol/devices")
def wol_devices():
    return _devices()


@router.post("/power/wol/devices")
def add_wol_device(body: dict):
    try:
        dev = _validate_device(body)
    except (ValueError, TypeError) as e:
        raise HTTPException(400, str(e))
    _save_devices(_devices() + [dev])
    return dev


@router.delete("/power/wol/devices/{device_id}")
def delete_wol_device(device_id: str):
    devices = _devices()
    if not any(d["id"] == device_id for d in devices):
        raise HTTPException(404, "Cihaz bulunamadı")
    _save_devices([d for d in devices if d["id"] != device_id])
    return {"success": True}


@router.post("/power/wol/devices/{device_id}/wake")
def wake_device(device_id: str):
    dev = next((d for d in _devices() if d["id"] == device_id), None)
    if not dev:
        raise HTTPException(404, "Cihaz bulunamadı")
    try:
        send_magic_packet(dev["mac"], dev.get("broadcast", "255.255.255.255"), dev.get("port", 9))
    except OSError as e:
        raise HTTPException(500, f"Paket gönderilemedi: {e}")
    return {"success": True, "message": f"{dev['name']} için uyandırma paketi gönderildi"}
