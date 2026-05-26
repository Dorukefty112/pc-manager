import os
import json
import subprocess
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from dependencies import require_auth

router = APIRouter(tags=["windows"])
CONFIG_PATH = Path(__file__).parent.parent / "config.json"

WIN_DIR = Path("/mnt/c/Windows/System32")
PS_EXE = WIN_DIR / "WindowsPowerShell" / "v1.0" / "powershell.exe"
CMD_EXE = WIN_DIR / "cmd.exe"


def _config():
    try:
        if CONFIG_PATH.exists():
            return json.loads(CONFIG_PATH.read_text())
    except Exception:
        pass
    return {}


def _check_wsl():
    if not WIN_DIR.exists():
        raise HTTPException(400, "WSL Windows erişimi yok (/mnt/c/Windows bulunamadı)")


def _check_enabled(feature=None):
    cfg = _config().get("windows", {})
    if not cfg.get("enabled"):
        raise HTTPException(403, "Windows entegrasyonu devre dışı")
    if feature and not cfg.get(feature):
        raise HTTPException(403, f"Bu özellik devre dışı: {feature}")


def _run(exe, args, timeout=15):
    try:
        r = subprocess.run(
            [str(exe)] + args,
            capture_output=True, text=True, timeout=timeout,
            errors='replace',
        )
        return {"code": r.returncode, "stdout": r.stdout, "stderr": r.stderr}
    except subprocess.TimeoutExpired:
        raise HTTPException(504, "Zaman aşımı")
    except FileNotFoundError:
        raise HTTPException(400, f"Çalıştırılabilir bulunamadı: {exe.name}")


def _ps(script, timeout=15):
    return _run(PS_EXE, [
        "-NoProfile", "-NonInteractive", "-Command", script,
    ], timeout)


@router.get("/windows/config")
def get_windows_config(_auth=Depends(require_auth)):
    cfg = _config().get("windows", {})
    is_wsl = WIN_DIR.exists()
    return {
        "enabled": cfg.get("enabled", False),
        "services": cfg.get("services", True),
        "processes": cfg.get("processes", True),
        "disk_info": cfg.get("disk_info", True),
        "network": cfg.get("network", True),
        "event_log": cfg.get("event_log", False),
        "command_palette": cfg.get("command_palette", False),
        "wsl_available": is_wsl,
    }


@router.get("/windows/services")
def list_windows_services(_auth=Depends(require_auth)):
    _check_wsl()
    _check_enabled("services")
    r = _run(CMD_EXE, ["/c", "sc.exe query type= service state= all"])
    if r["code"] != 0:
        raise HTTPException(500, "Windows servisleri alınamadı")
    lines = r["stdout"].splitlines()
    services = []
    current = {}
    for line in lines:
        line = line.strip()
        if line.startswith("SERVICE_NAME:"):
            if current.get("name"):
                services.append(current)
            current = {"name": line.split(":", 1)[1].strip()}
        elif line.startswith("DISPLAY_NAME:"):
            current["display"] = line.split(":", 1)[1].strip()
        elif line.startswith("STATE") and ":" in line:
            parts = line.split(":", 1)[1].strip()
            # e.g. "4  RUNNING"
            state_parts = parts.split(None, 1)
            current["state"] = state_parts[1] if len(state_parts) > 1 else parts
    if current.get("name"):
        services.append(current)
    return {"services": services, "count": len(services)}


@router.get("/windows/processes")
def list_windows_processes(_auth=Depends(require_auth)):
    _check_wsl()
    _check_enabled("processes")
    r = _run(CMD_EXE, ["/c", "tasklist.exe /FO CSV /NH"])
    if r["code"] != 0:
        raise HTTPException(500, "Windows process list alınamadı")
    import csv, io
    reader = csv.reader(io.StringIO(r["stdout"]))
    processes = []
    for row in reader:
        if len(row) >= 5:
            processes.append({
                "name": row[0].strip('"'),
                "pid": row[1].strip('"'),
                "session": row[2].strip('"'),
                "session_num": row[3].strip('"'),
                "mem_kb": row[4].strip('"').replace(",", ""),
            })
    return {"processes": processes, "count": len(processes)}


@router.get("/windows/disks")
def list_windows_disks(_auth=Depends(require_auth)):
    _check_wsl()
    _check_enabled("disk_info")
    r = _ps(
        "Get-PSDrive -PSProvider FileSystem | "
        "Select-Object Name,Root,Used,Free,@{N='Size';E={$_.Used+$_.Free}} | "
        "ConvertTo-Json"
    )
    if r["code"] != 0 or not r["stdout"].strip():
        raise HTTPException(500, "Disk bilgisi alınamadı")
    try:
        data = json.loads(r["stdout"])
        if isinstance(data, dict):
            data = [data]
        return {"disks": data}
    except json.JSONDecodeError:
        raise HTTPException(500, "Disk verisi parse edilemedi")


@router.get("/windows/network")
def get_windows_network(_auth=Depends(require_auth)):
    _check_wsl()
    _check_enabled("network")
    r = _run(CMD_EXE, ["/c", "ipconfig.exe /all"])
    if r["code"] != 0:
        raise HTTPException(500, "Ağ bilgisi alınamadı")
    return {"raw": r["stdout"]}


@router.get("/windows/system")
def get_windows_system(_auth=Depends(require_auth)):
    _check_wsl()
    _check_enabled("network")
    r = _run(CMD_EXE, ["/c", "systeminfo.exe /FO CSV"])
    if r["code"] != 0:
        raise HTTPException(500, "Sistem bilgisi alınamadı")
    lines = r["stdout"].splitlines()
    info = {}
    for line in lines:
        if ":" in line:
            k, _, v = line.partition(":")
            info[k.strip()] = v.strip()
    return {"system": info}


@router.get("/windows/events/{log_name}")
def get_windows_events(log_name: str, count: int = 50, _auth=Depends(require_auth)):
    _check_wsl()
    _check_enabled("event_log")
    allowed = {"System", "Application", "Security", "Setup"}
    if log_name not in allowed:
        raise HTTPException(400, f"Geçersiz log. İzin verilenler: {', '.join(allowed)}")
    r = _ps(
        f"Get-WinEvent -LogName {log_name} -MaxEvents {count} "
        f"| Select-Object TimeCreated,Id,LevelDisplayName,Message "
        f"| ConvertTo-Json",
        timeout=30,
    )
    if r["code"] != 0 or not r["stdout"].strip():
        return {"events": []}
    try:
        data = json.loads(r["stdout"])
        if isinstance(data, dict):
            data = [data]
        return {"events": data, "log": log_name, "count": len(data)}
    except json.JSONDecodeError:
        return {"events": []}


@router.post("/windows/command")
def run_windows_command(body: dict, _auth=Depends(require_auth)):
    _check_wsl()
    _check_enabled("command_palette")
    command = body.get("command", "").strip()
    if not command:
        raise HTTPException(400, "Komut gerekli")
    shell = body.get("shell", "cmd")
    if shell == "powershell":
        r = _ps(command, timeout=30)
    else:
        r = _run(CMD_EXE, ["/c", command], timeout=30)
    return r


@router.get("/windows/status")
def windows_status(_auth=Depends(require_auth)):
    _check_wsl()
    cfg = _config().get("windows", {})
    if not cfg.get("enabled"):
        return {"enabled": False, "wsl_available": True}
    return {
        "enabled": True,
        "wsl_available": True,
        "features": {
            k: cfg.get(k, False)
            for k in ["services", "processes", "disk_info", "network", "event_log", "command_palette"]
        },
    }
