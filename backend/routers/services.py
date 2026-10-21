import re
import subprocess
from datetime import datetime
from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["services"])

# Birim adları systemctl'e argv olarak gider; '-' ile başlayan değerler bayrak
# olarak yorumlanmasın diye doğrulanır.
_UNIT_RE = re.compile(r"^[A-Za-z0-9@_.:\\-]+$")
TIMER_PROPS = ["Id", "Description", "ActiveState", "UnitFileState", "Unit",
               "NextElapseUSecRealtime", "LastTriggerUSec", "TimersCalendar", "TimersMonotonic"]


def _unit(name: str) -> str:
    if not name or name.startswith("-") or not _UNIT_RE.match(name):
        raise HTTPException(400, "Geçersiz birim adı")
    return name

def _list_services():
    try:
        result = subprocess.run(
            ["systemctl", "list-units", "--type=service", "--all", "--no-pager", "--no-legend"],
            capture_output=True, text=True, timeout=10,
        )
        services = []
        for line in result.stdout.strip().split("\n"):
            parts = line.split()
            if len(parts) >= 4:
                services.append({
                    "name": parts[0],
                    "load": parts[1],
                    "active": parts[2],
                    "sub": parts[3],
                    "description": " ".join(parts[4:]) if len(parts) > 4 else "",
                })
        return services
    except Exception as e:
        return []

@router.get("/services")
def get_services(search: str = ""):
    svcs = _list_services()
    if search:
        svcs = [s for s in svcs if search.lower() in s["name"].lower()]
    return svcs

@router.post("/services/start")
def start_service(name: str):
    try:
        subprocess.run(["systemctl", "start", _unit(name)], check=True, timeout=30)
        return {"success": True}
    except subprocess.CalledProcessError as e:
        raise HTTPException(500, f"Failed to start {name}: {e}")

@router.post("/services/stop")
def stop_service(name: str):
    try:
        subprocess.run(["systemctl", "stop", _unit(name)], check=True, timeout=30)
        return {"success": True}
    except subprocess.CalledProcessError as e:
        raise HTTPException(500, f"Failed to stop {name}: {e}")

@router.post("/services/restart")
def restart_service(name: str):
    try:
        subprocess.run(["systemctl", "restart", _unit(name)], check=True, timeout=30)
        return {"success": True}
    except subprocess.CalledProcessError as e:
        raise HTTPException(500, f"Failed to restart {name}: {e}")

def _parse_systemd_time(value: str) -> int | None:
    """'Tue 2025-01-07 00:00:00 +03' -> epoch. Boş/n/a ise None."""
    value = (value or "").strip()
    if not value or value in ("n/a", "0"):
        return None
    parts = value.split()
    for candidate in (" ".join(parts[1:3]), " ".join(parts[0:2])):
        try:
            return int(datetime.strptime(candidate, "%Y-%m-%d %H:%M:%S").timestamp())
        except ValueError:
            continue
    return None


def parse_show_blocks(text: str) -> list[dict]:
    blocks, cur = [], {}
    for line in text.splitlines():
        if not line.strip():
            if cur:
                blocks.append(cur)
                cur = {}
            continue
        if "=" in line:
            k, v = line.split("=", 1)
            cur[k] = v
    if cur:
        blocks.append(cur)
    return blocks


def _schedule_text(props: dict) -> str:
    cal = props.get("TimersCalendar", "")
    m = re.search(r"OnCalendar=([^;]+)", cal)
    if m:
        return m.group(1).strip()
    mono = props.get("TimersMonotonic", "")
    m = re.findall(r"\{ (\w+)=([^;]+) ;", mono) or re.findall(r"(\w+)=([^;]+);", mono)
    return ", ".join(f"{k}={v.strip()}" for k, v in m) if m else ""


@router.get("/services/timers")
def list_timers():
    try:
        units = subprocess.run(
            ["systemctl", "list-units", "--type=timer", "--all", "--no-pager", "--no-legend", "--plain"],
            capture_output=True, text=True, timeout=10,
        ).stdout.split()
        names = [u for u in units if u.endswith(".timer")]
        if not names:
            return []
        out = subprocess.run(
            ["systemctl", "show", "--no-pager", "-p", ",".join(TIMER_PROPS), "--", *names],
            capture_output=True, text=True, timeout=15,
        ).stdout
    except FileNotFoundError:
        return []  # systemd olmayan sistem (Android/Termux, container)
    except (OSError, subprocess.TimeoutExpired) as e:
        raise HTTPException(500, f"systemctl çalıştırılamadı: {e}")
    timers = []
    for p in parse_show_blocks(out):
        timers.append({
            "name": p.get("Id", ""),
            "description": p.get("Description", ""),
            "active": p.get("ActiveState", ""),
            "enabled": p.get("UnitFileState", ""),
            "activates": p.get("Unit", ""),
            "next": _parse_systemd_time(p.get("NextElapseUSecRealtime", "")),
            "last": _parse_systemd_time(p.get("LastTriggerUSec", "")),
            "schedule": _schedule_text(p),
        })
    timers.sort(key=lambda t: (t["next"] is None, t["next"] or 0))
    return timers


@router.post("/services/timers/{name}/{action}")
def timer_action(name: str, action: str):
    name = _unit(name)
    if not name.endswith(".timer"):
        raise HTTPException(400, "Yalnızca .timer birimleri")
    commands = {
        "enable": ["systemctl", "enable", "--now", name],
        "disable": ["systemctl", "disable", "--now", name],
        "run": None,
    }
    if action not in commands:
        raise HTTPException(400, "Geçersiz işlem")
    if action == "run":
        target = subprocess.run(["systemctl", "show", "-p", "Unit", "--value", "--", name],
                                capture_output=True, text=True, timeout=10).stdout.strip()
        cmd = ["systemctl", "start", "--no-block", "--", _unit(target)]
    else:
        cmd = commands[action]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if r.returncode != 0:
        raise HTTPException(500, r.stderr.strip() or "systemctl hatası")
    return {"success": True}


@router.get("/services/{name}")
def get_service(name: str):
    try:
        result = subprocess.run(["systemctl", "show", _unit(name)], capture_output=True, text=True, timeout=10)
        props = {}
        for line in result.stdout.strip().split("\n"):
            if "=" in line:
                k, v = line.split("=", 1)
                props[k] = v
        return props
    except Exception as e:
        raise HTTPException(500, str(e))
