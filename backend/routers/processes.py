import psutil
import os
import signal
from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["processes"])

@router.get("/processes")
def list_processes(sort: str = "cpu", limit: int = 50, search: str = ""):
    procs = []
    for p in psutil.process_iter(["pid", "name", "cpu_percent", "memory_percent", "memory_info", "status", "username", "create_time"]):
        try:
            pinfo = p.info
            if search and search.lower() not in pinfo["name"].lower():
                continue
            procs.append(pinfo)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    key = "cpu_percent" if sort == "cpu" else "memory_percent"
    procs.sort(key=lambda x: x.get(key, 0) or 0, reverse=True)
    return procs[:limit]

@router.post("/processes/kill")
def kill_process(pid: int, force: bool = False):
    try:
        p = psutil.Process(pid)
        sig = signal.SIGKILL if force else signal.SIGTERM
        os.kill(pid, sig)
        return {"success": True, "pid": pid, "signal": "SIGKILL" if force else "SIGTERM"}
    except psutil.NoSuchProcess:
        raise HTTPException(404, f"Process {pid} not found")
    except PermissionError:
        raise HTTPException(403, f"Cannot kill process {pid}")

@router.get("/processes/{pid}")
def get_process(pid: int):
    try:
        p = psutil.Process(pid)
        return {
            "pid": p.pid,
            "name": p.name(),
            "exe": p.exe(),
            "cwd": p.cwd(),
            "status": p.status(),
            "username": p.username(),
            "cpu_percent": p.cpu_percent(),
            "memory_percent": p.memory_percent(),
            "memory_info": {"rss": p.memory_info().rss, "vms": p.memory_info().vms},
            "create_time": p.create_time(),
            "num_threads": p.num_threads(),
            "connections": len(p.connections()),
            "open_files": len(p.open_files()),
        }
    except psutil.NoSuchProcess:
        raise HTTPException(404, f"Process {pid} not found")
    except psutil.AccessDenied:
        raise HTTPException(403, f"Access denied to process {pid}")
