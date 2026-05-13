import os
import psutil
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(tags=["disks"])

@router.get("/disks/list")
def disk_list():
    disks = []
    for dp in psutil.disk_partitions():
        try:
            usage = psutil.disk_usage(dp.mountpoint)
            disks.append({
                "device": dp.device,
                "mount": dp.mountpoint,
                "fstype": dp.fstype,
                "total": usage.total,
                "used": usage.used,
                "free": usage.free,
                "percent": usage.percent,
            })
        except: pass
    return disks

@router.get("/disks/usage")
def disk_usage(path: str = Query("/")):
    results = []
    try:
        root = os.path.abspath(path)
        entries = []
        with os.scandir(root) as it:
            for entry in it:
                try:
                    if entry.is_dir(follow_symlinks=False):
                        size = _dir_size(entry.path)
                        entries.append({"name": entry.name, "path": entry.path, "size": size, "is_dir": True})
                    else:
                        stat = entry.stat(follow_symlinks=False)
                        entries.append({"name": entry.name, "path": entry.path, "size": stat.st_size, "is_dir": False})
                except (PermissionError, OSError):
                    continue
        entries.sort(key=lambda x: x["size"], reverse=True)
        return {"path": root, "parent": os.path.dirname(root) if root != "/" else None, "items": entries[:100]}
    except PermissionError:
        raise HTTPException(403, "permission denied")
    except Exception as e:
        raise HTTPException(400, str(e))

def _dir_size(path):
    try:
        total = 0
        for dirpath, dirnames, filenames in os.walk(path):
            for f in filenames:
                try:
                    fp = os.path.join(dirpath, f)
                    total += os.path.getsize(fp)
                except: pass
            if total > 10 * 1024**3: break
        return total
    except: return 0
