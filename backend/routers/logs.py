import subprocess
import time
from fastapi import APIRouter, Query

router = APIRouter(tags=["logs"])

@router.get("/logs")
def get_logs(unit: str = "", lines: int = Query(100, le=500), priority: str = ""):
    cmd = ["journalctl", "--no-pager", "-n", str(lines), "-o", "short-iso"]
    if unit:
        cmd.extend(["-u", unit])
    if priority:
        cmd.extend(["-p", priority])
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        entries = []
        for line in result.stdout.split("\n"):
            if not line.strip():
                continue
            entries.append(line.rstrip())
        return {"lines": entries, "count": len(entries)}
    except subprocess.TimeoutExpired:
        return {"lines": [], "count": 0, "error": "timeout"}
    except Exception as e:
        return {"lines": [], "count": 0, "error": str(e)}

@router.get("/logs/units")
def list_units():
    try:
        result = subprocess.run(
            ["systemctl", "list-units", "--type=service", "--all", "--no-pager", "--no-legend"],
            capture_output=True, text=True, timeout=10,
        )
        units = []
        for line in result.stdout.split("\n"):
            parts = line.split()
            if len(parts) >= 4:
                units.append({"name": parts[0], "load": parts[1], "active": parts[2], "sub": parts[3]})
        return units[:100]
    except: return []
