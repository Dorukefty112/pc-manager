import subprocess
from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["services"])

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
        subprocess.run(["systemctl", "start", name], check=True, timeout=30)
        return {"success": True}
    except subprocess.CalledProcessError as e:
        raise HTTPException(500, f"Failed to start {name}: {e}")

@router.post("/services/stop")
def stop_service(name: str):
    try:
        subprocess.run(["systemctl", "stop", name], check=True, timeout=30)
        return {"success": True}
    except subprocess.CalledProcessError as e:
        raise HTTPException(500, f"Failed to stop {name}: {e}")

@router.post("/services/restart")
def restart_service(name: str):
    try:
        subprocess.run(["systemctl", "restart", name], check=True, timeout=30)
        return {"success": True}
    except subprocess.CalledProcessError as e:
        raise HTTPException(500, f"Failed to restart {name}: {e}")

@router.get("/services/{name}")
def get_service(name: str):
    try:
        result = subprocess.run(["systemctl", "show", name], capture_output=True, text=True, timeout=10)
        props = {}
        for line in result.stdout.strip().split("\n"):
            if "=" in line:
                k, v = line.split("=", 1)
                props[k] = v
        return props
    except Exception as e:
        raise HTTPException(500, str(e))
