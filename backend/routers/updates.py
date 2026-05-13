import os
import shutil
import subprocess
from fastapi import APIRouter

router = APIRouter(tags=["updates"])

def _detect_pm():
    if shutil.which("pacman"):
        return "pacman"
    if shutil.which("apt"):
        return "apt"
    if shutil.which("dnf"):
        return "dnf"
    if shutil.which("yum"):
        return "yum"
    if shutil.which("zypper"):
        return "zypper"
    return None

def _check_pacman():
    try:
        result = subprocess.run(["pacman", "-Qu"], capture_output=True, text=True, timeout=30)
        lines = [l.strip() for l in result.stdout.split("\n") if l.strip()]
        updates = []
        for line in lines:
            parts = line.split()
            if len(parts) >= 2:
                updates.append({"package": parts[0], "old_version": None, "new_version": parts[1]})
            else:
                updates.append({"package": parts[0]})
        return {"count": len(updates), "updates": updates, "pm": "pacman"}
    except FileNotFoundError:
        return None
    except subprocess.TimeoutExpired:
        return {"count": 0, "updates": [], "error": "Zaman aşımı", "pm": "pacman"}
    except Exception as e:
        return {"count": 0, "updates": [], "error": str(e), "pm": "pacman"}

def _check_apt():
    try:
        subprocess.run(["apt", "update"], capture_output=True, text=True, timeout=60)
        result = subprocess.run(["apt", "list", "--upgradable"], capture_output=True, text=True, timeout=30)
        lines = [l.strip() for l in result.stdout.split("\n") if l.strip() and "/" in l]
        updates = []
        for line in lines:
            parts = line.split()
            if len(parts) >= 2:
                pkg = parts[0].split("/")[0]
                updates.append({"package": pkg, "old_version": None, "new_version": parts[1]})
        return {"count": len(updates), "updates": updates, "pm": "apt"}
    except FileNotFoundError:
        return None
    except Exception as e:
        return {"count": 0, "updates": [], "error": str(e), "pm": "apt"}

def _check_dnf():
    try:
        result = subprocess.run(["dnf", "check-update"], capture_output=True, text=True, timeout=60)
        lines = [l.strip() for l in result.stdout.split("\n") if l.strip() and not l.startswith(("Last", "Upgrade", "Start", "Error")) and "." in l]
        updates = []
        for line in lines:
            parts = line.split()
            if len(parts) >= 2:
                updates.append({"package": parts[0], "old_version": parts[1] if len(parts) > 1 else None, "new_version": parts[2] if len(parts) > 2 else None})
        return {"count": len(updates), "updates": updates, "pm": "dnf"}
    except FileNotFoundError:
        return None
    except Exception as e:
        return {"count": 0, "updates": [], "error": str(e), "pm": "dnf"}

_CHECKERS = {
    "pacman": _check_pacman,
    "apt": _check_apt,
    "dnf": _check_dnf,
}

@router.get("/updates/check")
def check_updates():
    pm = _detect_pm()
    if not pm:
        return {"count": 0, "updates": [], "error": "Paket yöneticisi bulunamadı (pacman/apt/dnf)", "pm": None}
    checker = _CHECKERS.get(pm)
    if not checker:
        return {"count": 0, "updates": [], "error": f"{pm} için kontrol henüz desteklenmiyor", "pm": pm}
    result = checker()
    if result is None:
        return {"count": 0, "updates": [], "error": f"{pm} bulunamadı", "pm": pm}
    return result

def _do_upgrade_pacman():
    subprocess.Popen(["pacman", "-Syu", "--noconfirm"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return "Upgrade started in background (pacman)"

def _do_upgrade_apt():
    subprocess.Popen(["apt", "upgrade", "-y"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return "Upgrade started in background (apt)"

def _do_upgrade_dnf():
    subprocess.Popen(["dnf", "upgrade", "-y"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return "Upgrade started in background (dnf)"

_UPGRADERS = {
    "pacman": _do_upgrade_pacman,
    "apt": _do_upgrade_apt,
    "dnf": _do_upgrade_dnf,
}

@router.post("/updates/upgrade")
def upgrade_system():
    pm = _detect_pm()
    if not pm:
        return {"success": False, "error": "Paket yöneticisi bulunamadı"}
    upgrader = _UPGRADERS.get(pm)
    if not upgrader:
        return {"success": False, "error": f"{pm} için güncelleme desteklenmiyor"}
    try:
        msg = upgrader()
        return {"success": True, "message": msg}
    except Exception as e:
        return {"success": False, "error": str(e)}
