import json
import subprocess
from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["docker"])

def _run(cmd):
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            return {"error": result.stderr.strip()}
        return result.stdout.strip()
    except FileNotFoundError:
        return {"error": "Docker kurulu değil"}
    except subprocess.TimeoutExpired:
        return {"error": "Zaman aşımı"}
    except Exception as e:
        return {"error": str(e)}

@router.get("/docker/info")
def docker_info():
    out = _run(["docker", "info", "--format", "{{json .}}"])
    if isinstance(out, dict) and "error" in out:
        return {"installed": False, "error": out["error"]}
    try:
        info = json.loads(out)
        return {"installed": True, "containers": info.get("Containers", 0), "running": info.get("ContainersRunning", 0), "images": info.get("Images", 0), "version": info.get("ServerVersion", "?")}
    except:
        return {"installed": True}

@router.get("/docker/containers")
def list_containers(all: bool = False):
    flag = "--all" if all else ""
    out = _run(["docker", "ps", flag, "--format", "{{json .}}", "--no-trunc"])
    if isinstance(out, dict) and "error" in out:
        raise HTTPException(400, out["error"])
    if not out:
        return []
    containers = []
    for line in out.strip().split("\n"):
        if not line.strip():
            continue
        try:
            c = json.loads(line)
            containers.append({
                "id": c.get("ID", "")[:12],
                "name": c.get("Names", "").lstrip("/"),
                "image": c.get("Image", ""),
                "status": c.get("Status", ""),
                "state": c.get("State", ""),
                "ports": c.get("Ports", ""),
                "created": c.get("CreatedAt", ""),
            })
        except:
            pass
    return containers

@router.get("/docker/images")
def list_images():
    out = _run(["docker", "images", "--format", "{{json .}}"])
    if isinstance(out, dict) and "error" in out:
        raise HTTPException(400, out["error"])
    if not out:
        return []
    images = []
    for line in out.strip().split("\n"):
        if not line.strip():
            continue
        try:
            img = json.loads(line)
            images.append({
                "id": img.get("ID", "")[:12],
                "repository": img.get("Repository", ""),
                "tag": img.get("Tag", ""),
                "size": img.get("Size", ""),
                "created": img.get("CreatedAt", ""),
            })
        except:
            pass
    return images

@router.post("/docker/container/start")
def start_container(container_id: str):
    out = _run(["docker", "start", container_id])
    if isinstance(out, dict) and "error" in out:
        raise HTTPException(400, out["error"])
    return {"success": True, "message": f"{container_id} başlatıldı"}

@router.post("/docker/container/stop")
def stop_container(container_id: str):
    out = _run(["docker", "stop", container_id])
    if isinstance(out, dict) and "error" in out:
        raise HTTPException(400, out["error"])
    return {"success": True, "message": f"{container_id} durduruldu"}

@router.post("/docker/container/restart")
def restart_container(container_id: str):
    out = _run(["docker", "restart", container_id])
    if isinstance(out, dict) and "error" in out:
        raise HTTPException(400, out["error"])
    return {"success": True, "message": f"{container_id} yeniden başlatıldı"}

@router.delete("/docker/container")
def remove_container(container_id: str, force: bool = False):
    flag = "-f" if force else ""
    out = _run(["docker", "rm", flag, container_id])
    if isinstance(out, dict) and "error" in out:
        raise HTTPException(400, out["error"])
    return {"success": True, "message": f"{container_id} silindi"}

@router.get("/docker/logs/{container_id}")
def container_logs(container_id: str, tail: int = 100):
    out = _run(["docker", "logs", "--tail", str(tail), container_id])
    if isinstance(out, dict) and "error" in out:
        raise HTTPException(400, out["error"])
    return {"lines": out.strip().split("\n") if out else []}
