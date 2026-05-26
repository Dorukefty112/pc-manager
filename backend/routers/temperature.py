import subprocess
from fastapi import APIRouter

router = APIRouter(tags=["temperature"])

POWERSHELL = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"


def _ps(cmd: str, timeout: int = 10) -> str:
    try:
        r = subprocess.run(
            [POWERSHELL, "-NoProfile", "-Command", cmd],
            capture_output=True, text=True, timeout=timeout,
        )
        return r.stdout.strip()
    except Exception:
        return ""


def _parse_nvidia(csv: str) -> dict | None:
    if not csv or "," not in csv:
        return None
    parts = [p.strip() for p in csv.split(",")]
    if len(parts) < 3:
        return None
    try:
        return {
            "temp_c": int(parts[0]),
            "name": parts[1],
            "util_pct": int(parts[2].replace("%", "").strip()),
            "power_w": float(parts[3].replace("W", "").strip()) if len(parts) > 3 else 0,
        }
    except (ValueError, IndexError):
        return None


def _get_gpu() -> dict | None:
    raw = _ps("nvidia-smi --query-gpu=temperature.gpu,name,utilization.gpu,power.draw --format=csv,noheader")
    return _parse_nvidia(raw)


def _get_cpu() -> dict:
    info = {"model": "", "usage_pct": 0, "freq_mhz": 0, "cores": 0, "threads": 0}

    raw = _ps(
        "Get-CimInstance -ClassName Win32_Processor | "
        "Select-Object Name,NumberOfCores,NumberOfLogicalProcessors,"
        "CurrentClockSpeed,MaxClockSpeed,LoadPercentage | Format-List"
    )
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        if ":" not in line:
            continue
        k, v = (x.strip() for x in line.split(":", 1))
        if k == "Name":
            info["model"] = v
        elif k == "NumberOfCores":
            try:
                info["cores"] = int(v)
            except ValueError:
                pass
        elif k == "NumberOfLogicalProcessors":
            try:
                info["threads"] = int(v)
            except ValueError:
                pass
        elif k == "CurrentClockSpeed":
            try:
                info["freq_mhz"] = int(v)
            except ValueError:
                pass
        elif k == "LoadPercentage":
            try:
                info["usage_pct"] = int(v)
            except ValueError:
                pass

    return info


def _get_system() -> dict:
    try:
        import os

        load1, load5, load15 = os.getloadavg()
    except Exception:
        load1 = load5 = load15 = 0

    try:
        mem = {}
        with open("/proc/meminfo") as f:
            for line in f:
                parts = line.split()
                if len(parts) >= 2:
                    mem[parts[0].rstrip(":")] = int(parts[1])
        total = mem.get("MemTotal", 0) // 1024
        avail = mem.get("MemAvailable", 0) // 1024
        used = total - avail
        mem_info = {
            "total_mb": total,
            "used_mb": used,
            "avail_mb": avail,
            "usage_pct": round(used / total * 100, 1) if total else 0,
        }
    except Exception:
        mem_info = {}

    uptime = 0
    try:
        with open("/proc/uptime") as f:
            uptime = float(f.read().split()[0])
    except Exception:
        pass

    return {
        "load": [round(load1, 2), round(load5, 2), round(load15, 2)],
        "memory": mem_info,
        "uptime": uptime,
    }


@router.get("/temperature")
def get_temperature():
    gpu = _get_gpu()
    cpu = _get_cpu()
    system = _get_system()

    return {
        "gpu": gpu,
        "cpu": cpu,
        "system": system,
    }
