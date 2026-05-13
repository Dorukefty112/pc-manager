import platform
import socket
import psutil
from datetime import datetime
from fastapi import APIRouter

router = APIRouter(tags=["system"])

@router.get("/system/info")
def get_system_info():
    uname = platform.uname()
    boot_time = datetime.fromtimestamp(psutil.boot_time()).isoformat()
    return {
        "hostname": socket.gethostname(),
        "os": f"{uname.system} {uname.release}",
        "kernel": uname.version,
        "arch": uname.machine,
        "boot_time": boot_time,
        "uptime_days": round((datetime.now().timestamp() - psutil.boot_time()) / 86400, 2),
        "cpu": {
            "brand": _get_cpu_brand(),
            "physical_cores": psutil.cpu_count(logical=False),
            "logical_cores": psutil.cpu_count(logical=True),
            "max_freq": psutil.cpu_freq().max if psutil.cpu_freq() else None,
            "min_freq": psutil.cpu_freq().min if psutil.cpu_freq() else None,
        },
        "memory": {
            "total": psutil.virtual_memory().total,
            "swap_total": psutil.swap_memory().total,
        },
        "disks": [_disk_info(dp) for dp in psutil.disk_partitions() if dp.fstype],
        "users": [u.name for u in psutil.users()],
    }

def _get_cpu_brand():
    try:
        with open("/proc/cpuinfo") as f:
            for line in f:
                if "model name" in line:
                    return line.split(":")[1].strip()
    except: pass
    return "Unknown"

def _disk_info(dp):
    try:
        usage = psutil.disk_usage(dp.mountpoint)
        return {
            "device": dp.device,
            "mount": dp.mountpoint,
            "fstype": dp.fstype,
            "total": usage.total,
            "used": usage.used,
            "free": usage.free,
            "percent": usage.percent,
        }
    except: return None

@router.get("/system/disks")
def get_disks():
    return [_disk_info(dp) for dp in psutil.disk_partitions() if dp.fstype]
