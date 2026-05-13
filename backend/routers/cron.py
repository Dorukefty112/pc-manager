import os
import subprocess
import tempfile
from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["cron"])

CRON_USER = os.getenv("USER", "doruk")

def _run_crontab(args, input_data=None):
    try:
        result = subprocess.run(
            ["crontab"] + args,
            input=input_data,
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            raise HTTPException(400, result.stderr.strip())
        return result.stdout
    except FileNotFoundError:
        raise HTTPException(400, "cron (crontab) sistemde bulunamadı")
    except subprocess.TimeoutExpired:
        raise HTTPException(500, "Zaman aşımı")

def _parse_crontab(text):
    lines = []
    for line in text.strip().split("\n"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(None, 5)
        if len(parts) >= 6:
            lines.append({
                "schedule": " ".join(parts[:5]),
                "command": parts[5],
                "raw": line,
                "min": parts[0],
                "hour": parts[1],
                "dom": parts[2],
                "mon": parts[3],
                "dow": parts[4],
            })
    return lines

def _describe_schedule(s):
    labels = {"*": "her", "*/5": "her 5", "*/10": "her 10", "*/15": "her 15", "*/30": "her 30"}
    parts = []
    for i, key in enumerate(["min", "hour", "dom", "mon", "dow"]):
        val = s.get(key, "*")
        name = ["dk", "saat", "gün", "ay", "hafta(gün)"][i]
        if val == "*":
            continue
        parts.append(f"{labels.get(val, val)} {name}")
    return ", ".join(parts) if parts else "her dakika"

@router.get("/cron/jobs")
def list_cron_jobs():
    try:
        result = subprocess.run(
            ["crontab", "-u", CRON_USER, "-l"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode != 0:
            return {"jobs": [], "raw": ""}
        jobs = _parse_crontab(result.stdout)
        for job in jobs:
            job["schedule_desc"] = _describe_schedule(job)
        return {"jobs": jobs, "raw": result.stdout}
    except FileNotFoundError:
        raise HTTPException(400, "cron bulunamadı")

@router.post("/cron/jobs")
def add_cron_job(schedule: str, command: str):
    result = subprocess.run(
        ["crontab", "-u", CRON_USER, "-l"],
        capture_output=True, text=True, timeout=10,
    )
    current = result.stdout if result.returncode == 0 else ""
    parts = schedule.strip().split()
    if len(parts) != 5:
        raise HTTPException(400, "Geçersiz schedule formatı (5 alan: dk saat gün ay hafta)")
    new_line = f"{' '.join(parts)} {command}\n"
    with tempfile.NamedTemporaryFile(mode="w", delete=False) as f:
        f.write(current)
        f.write(new_line)
        tmp = f.name
    _run_crontab(["-u", CRON_USER, tmp])
    os.unlink(tmp)
    return {"success": True, "message": "Cron job eklendi"}

@router.delete("/cron/jobs")
def remove_cron_job(command: str):
    result = subprocess.run(
        ["crontab", "-u", CRON_USER, "-l"],
        capture_output=True, text=True, timeout=10,
    )
    if result.returncode != 0:
        raise HTTPException(400, "crontab boş")
    lines = result.stdout.strip().split("\n")
    filtered = [l for l in lines if command not in l]
    with tempfile.NamedTemporaryFile(mode="w", delete=False) as f:
        f.write("\n".join(filtered) + "\n")
        tmp = f.name
    _run_crontab(["-u", CRON_USER, tmp])
    os.unlink(tmp)
    return {"success": True, "message": "Cron job silindi"}
