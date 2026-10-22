import re
import json
import os
import asyncio
import subprocess
import shutil
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Query
from dependencies import authorize_ws
from .terminal import run_pty, Recorder, _recording_enabled

router = APIRouter(tags=["docker"])
# WebSocket uç noktaları kendi token doğrulamasını yapar; header tabanlı
# require_auth bağımlılığı olan ana router'a eklenemez.
ws_router = APIRouter(tags=["docker"])

# Container/image referansları argv'ye gider; '-' ile başlayan bir değer
# bayrak olarak yorumlanmasın diye sıkı biçimde doğrulanır.
_REF_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:/@-]{0,254}$")
PRUNE_TARGETS = {"containers": ["container", "prune"], "images": ["image", "prune", "-a"],
                 "volumes": ["volume", "prune"], "networks": ["network", "prune"],
                 "system": ["system", "prune"]}


def _ref(value: str) -> str:
    if not value or not _REF_RE.match(value):
        raise HTTPException(400, "Geçersiz container/image referansı")
    return value

_RUNTIME = None
_COMPOSE_CMD = None

def _detect_container_runtime():
    global _RUNTIME, _COMPOSE_CMD
    if shutil.which("podman"):
        _RUNTIME = "podman"
    elif shutil.which("docker"):
        _RUNTIME = "docker"
    else:
        _RUNTIME = "docker"

    if _RUNTIME == "podman" and shutil.which("podman-compose"):
        _COMPOSE_CMD = ["podman-compose"]
    elif _COMPOSE_CMD is None:
        try:
            r = subprocess.run(["docker", "compose", "version"], capture_output=True, text=True, timeout=5)
            if r.returncode == 0:
                _COMPOSE_CMD = ["docker", "compose"]
            elif shutil.which("docker-compose"):
                _COMPOSE_CMD = ["docker-compose"]
            else:
                _COMPOSE_CMD = None
        except Exception:
            if shutil.which("docker-compose"):
                _COMPOSE_CMD = ["docker-compose"]
            else:
                _COMPOSE_CMD = None
    return _RUNTIME

def _get_runtime():
    if _RUNTIME is None:
        _detect_container_runtime()
    return _RUNTIME

def _get_compose_cmd():
    if _COMPOSE_CMD is None:
        _detect_container_runtime()
    return _COMPOSE_CMD

def _run(cmd, timeout=30):
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        if result.returncode != 0:
            return {"error": result.stderr.strip()}
        return result.stdout.strip()
    except FileNotFoundError:
        return {"error": f"{_get_runtime()} not installed"}
    except subprocess.TimeoutExpired:
        return {"error": "Timed out"}
    except Exception as e:
        return {"error": str(e)}

def _runtime_cmd(*args):
    return [_get_runtime()] + [a for a in args if a]

def _find_compose_file(project_path):
    for name in ("docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"):
        fp = os.path.join(project_path, name)
        if os.path.isfile(fp):
            return fp
    return None

@router.get("/docker/info")
def docker_info():
    out = _run(_runtime_cmd("info", "--format", "{{json .}}"))
    if isinstance(out, dict) and "error" in out:
        return {"installed": False, "error": out["error"]}
    try:
        info = json.loads(out)
        return {
            "installed": True,
            "containers": info.get("Containers", 0),
            "running": info.get("ContainersRunning", 0),
            "images": info.get("Images", 0),
            "version": info.get("ServerVersion", "?"),
            "runtime": _get_runtime(),
        }
    except Exception:
        return {"installed": True, "runtime": _get_runtime()}

@router.get("/docker/containers")
def list_containers(all: bool = False):
    flag = "--all" if all else ""
    out = _run(_runtime_cmd("ps", flag, "--format", "{{json .}}", "--no-trunc"))
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
        except Exception:
            pass
    if containers:
        stats_out = _run(_runtime_cmd("stats", "--no-stream", "--format", "{{json .}}"))
        if not isinstance(stats_out, dict):
            stats_map = {}
            for line in stats_out.strip().split("\n"):
                if not line.strip():
                    continue
                try:
                    s = json.loads(line)
                    cid = s.get("Container", "")[:12]
                    stats_map[cid] = {
                        "cpu_percent": s.get("CPUPerc", ""),
                        "mem_percent": s.get("MemPerc", ""),
                        "mem_usage": s.get("MemUsage", ""),
                        "net_io": s.get("NetIO", ""),
                    }
                except Exception:
                    pass
            for c in containers:
                s = stats_map.get(c["id"])
                if s:
                    c.update(s)
    return containers

@router.get("/docker/images")
def list_images():
    out = _run(_runtime_cmd("images", "--format", "{{json .}}"))
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
        except Exception:
            pass
    return images

@router.post("/docker/container/start")
def start_container(container_id: str):
    out = _run(_runtime_cmd("start", _ref(container_id)))
    if isinstance(out, dict) and "error" in out:
        raise HTTPException(400, out["error"])
    return {"success": True, "message": f"{container_id} started"}

@router.post("/docker/container/stop")
def stop_container(container_id: str):
    out = _run(_runtime_cmd("stop", _ref(container_id)))
    if isinstance(out, dict) and "error" in out:
        raise HTTPException(400, out["error"])
    return {"success": True, "message": f"{container_id} stopped"}

@router.post("/docker/container/restart")
def restart_container(container_id: str):
    out = _run(_runtime_cmd("restart", _ref(container_id)))
    if isinstance(out, dict) and "error" in out:
        raise HTTPException(400, out["error"])
    return {"success": True, "message": f"{container_id} restarted"}

@router.delete("/docker/container")
def remove_container(container_id: str, force: bool = False):
    flag = "-f" if force else ""
    out = _run(_runtime_cmd("rm", flag, _ref(container_id)))
    if isinstance(out, dict) and "error" in out:
        raise HTTPException(400, out["error"])
    return {"success": True, "message": f"{container_id} removed"}

@router.get("/docker/logs/{container_id}")
def container_logs(container_id: str, tail: int = 100):
    out = _run(_runtime_cmd("logs", "--tail", str(int(tail)), _ref(container_id)))
    if isinstance(out, dict) and "error" in out:
        raise HTTPException(400, out["error"])
    return {"lines": out.strip().split("\n") if out else []}

@router.get("/docker/container/{container_id}/stats")
def container_stats(container_id: str):
    out = _run(_runtime_cmd("stats", "--no-stream", "--format", "{{json .}}", _ref(container_id)))
    if isinstance(out, dict) and "error" in out:
        raise HTTPException(400, out["error"])
    if not out:
        raise HTTPException(400, "No stats returned")
    try:
        stats = json.loads(out)
        return {
            "cpu_percent": stats.get("CPUPerc", ""),
            "mem_percent": stats.get("MemPerc", ""),
            "mem_usage": stats.get("MemUsage", ""),
            "net_io": stats.get("NetIO", ""),
            "block_io": stats.get("BlockIO", ""),
            "pids": stats.get("PIDs", ""),
        }
    except Exception:
        raise HTTPException(400, "Could not parse stats")

@router.get("/docker/compose/projects")
def compose_projects():
    compose_cmd = _get_compose_cmd()
    if not compose_cmd:
        raise HTTPException(400, "Compose command not available")
    projects = []
    search_dirs = ["/home", "/opt", "/srv", "/etc/docker"]
    found_paths = set()
    for d in search_dirs:
        if not os.path.isdir(d):
            continue
        try:
            result = subprocess.run(
                ["find", d, "-maxdepth", "4",
                 "-name", "docker-compose.yml", "-o",
                 "-name", "docker-compose.yaml", "-o",
                 "-name", "compose.yml", "-o",
                 "-name", "compose.yaml"],
                capture_output=True, text=True, timeout=5
            )
            for filepath in result.stdout.strip().split("\n"):
                if not filepath.strip():
                    continue
                project_path = os.path.dirname(filepath)
                if project_path in found_paths:
                    continue
                found_paths.add(project_path)
                services = []
                try:
                    ps_out = subprocess.run(
                        [*compose_cmd, "-f", filepath, "ps", "--format", "{{.Name}}\t{{.State}}"],
                        capture_output=True, text=True, timeout=10, cwd=project_path
                    )
                    if ps_out.returncode == 0 and ps_out.stdout.strip():
                        for line in ps_out.stdout.strip().split("\n"):
                            parts = line.strip().split("\t")
                            if len(parts) >= 2:
                                services.append({"name": parts[0], "state": parts[1]})
                except Exception:
                    pass
                running = sum(1 for s in services if s["state"] == "running")
                projects.append({
                    "path": project_path,
                    "file": filepath,
                    "status": "running" if running > 0 else ("stopped" if services else "empty"),
                    "services": len(services),
                    "running_services": running,
                })
        except Exception:
            pass
    return projects

@router.post("/docker/compose/up")
def compose_up(project_path: str):
    compose_cmd = _get_compose_cmd()
    if not compose_cmd:
        raise HTTPException(400, "Compose command not available")
    compose_file = _find_compose_file(project_path)
    if not compose_file:
        raise HTTPException(400, "No compose file found in project path")
    out = _run([*compose_cmd, "-f", compose_file, "up", "-d"], timeout=60)
    if isinstance(out, dict) and "error" in out:
        raise HTTPException(400, out["error"])
    return {"success": True, "message": "Compose project started", "output": str(out)}

@router.post("/docker/compose/down")
def compose_down(project_path: str):
    compose_cmd = _get_compose_cmd()
    if not compose_cmd:
        raise HTTPException(400, "Compose command not available")
    compose_file = _find_compose_file(project_path)
    if not compose_file:
        raise HTTPException(400, "No compose file found in project path")
    out = _run([*compose_cmd, "-f", compose_file, "down"], timeout=60)
    if isinstance(out, dict) and "error" in out:
        raise HTTPException(400, out["error"])
    return {"success": True, "message": "Compose project stopped", "output": str(out)}

@router.post("/docker/compose/ps")
def compose_ps(project_path: str):
    compose_cmd = _get_compose_cmd()
    if not compose_cmd:
        raise HTTPException(400, "Compose command not available")
    compose_file = _find_compose_file(project_path)
    if not compose_file:
        raise HTTPException(400, "No compose file found in project path")
    out = _run([*compose_cmd, "-f", compose_file, "ps", "--format", "{{.Name}}\t{{.State}}\t{{.Ports}}"])
    if isinstance(out, dict) and "error" in out:
        raise HTTPException(400, out["error"])
    services = []
    if out:
        for line in out.strip().split("\n"):
            parts = line.strip().split("\t")
            if len(parts) >= 2:
                services.append({
                    "name": parts[0],
                    "state": parts[1],
                    "ports": parts[2] if len(parts) > 2 else "",
                })
    return {"services": services}

@router.get("/docker/compose/logs")
def compose_logs(project_path: str, lines: int = 50):
    compose_cmd = _get_compose_cmd()
    if not compose_cmd:
        raise HTTPException(400, "Compose command not available")
    compose_file = _find_compose_file(project_path)
    if not compose_file:
        raise HTTPException(400, "No compose file found in project path")
    out = _run([*compose_cmd, "-f", compose_file, "logs", "--tail", str(lines), "--no-color"])
    if isinstance(out, dict) and "error" in out:
        raise HTTPException(400, out["error"])
    return {"lines": out.strip().split("\n") if out else []}


def _compose_file_or_400(project_path: str) -> tuple[list[str], str]:
    compose_cmd = _get_compose_cmd()
    if not compose_cmd:
        raise HTTPException(400, "Compose command not available")
    compose_file = _find_compose_file(project_path)
    if not compose_file:
        raise HTTPException(400, "No compose file found in project path")
    return compose_cmd, compose_file


@router.post("/docker/compose/restart")
def compose_restart(project_path: str):
    compose_cmd, compose_file = _compose_file_or_400(project_path)
    out = _run([*compose_cmd, "-f", compose_file, "restart"], timeout=120)
    if isinstance(out, dict) and "error" in out:
        raise HTTPException(400, out["error"])
    return {"success": True, "output": str(out)}


@router.post("/docker/compose/pull")
def compose_pull(project_path: str):
    """İmajları güncelle ve servisleri yeniden oluştur."""
    compose_cmd, compose_file = _compose_file_or_400(project_path)
    pulled = _run([*compose_cmd, "-f", compose_file, "pull"], timeout=900)
    if isinstance(pulled, dict) and "error" in pulled:
        raise HTTPException(400, pulled["error"])
    out = _run([*compose_cmd, "-f", compose_file, "up", "-d"], timeout=300)
    if isinstance(out, dict) and "error" in out:
        raise HTTPException(400, out["error"])
    return {"success": True, "output": f"{pulled}\n{out}".strip()}


@router.post("/docker/images/pull")
def pull_image(body: dict):
    image = _ref((body.get("image") or "").strip())
    out = _run(_runtime_cmd("pull", image), timeout=900)
    if isinstance(out, dict) and "error" in out:
        raise HTTPException(400, out["error"])
    return {"success": True, "output": out.splitlines()[-5:] if out else []}


@router.delete("/docker/images")
def remove_image(image_id: str, force: bool = False):
    out = _run(_runtime_cmd("rmi", "-f" if force else "", _ref(image_id)))
    if isinstance(out, dict) and "error" in out:
        raise HTTPException(400, out["error"])
    return {"success": True}


@router.post("/docker/prune")
def prune(target: str):
    if target not in PRUNE_TARGETS:
        raise HTTPException(400, f"Geçersiz hedef. Seçenekler: {', '.join(PRUNE_TARGETS)}")
    out = _run(_runtime_cmd(*PRUNE_TARGETS[target], "-f"), timeout=300)
    if isinstance(out, dict) and "error" in out:
        raise HTTPException(400, out["error"])
    reclaimed = next((l for l in str(out).splitlines() if "reclaimed" in l.lower()), "")
    return {"success": True, "reclaimed": reclaimed.strip(), "output": str(out)[-2000:]}


@ws_router.websocket("/docker/logs/{container_id}/ws")
async def stream_logs(websocket: WebSocket, container_id: str, token: str = Query(""), tail: int = 200):
    """docker logs -f çıktısını satır satır yayınlar."""
    if not await authorize_ws(websocket, token, admin=False):
        return
    if not _REF_RE.match(container_id):
        await websocket.close(code=4400, reason="Geçersiz container")
        return
    await websocket.accept()
    proc = await asyncio.create_subprocess_exec(
        *_runtime_cmd("logs", "-f", "--timestamps", "--tail", str(max(0, min(tail, 5000))), container_id),
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
    )

    async def pump():
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            await websocket.send_text(line.decode("utf-8", errors="replace").rstrip("\n"))

    async def watch_client():
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            pass

    tasks = [asyncio.ensure_future(pump()), asyncio.ensure_future(watch_client())]
    try:
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    except Exception:
        pass
    finally:
        for t in tasks:
            t.cancel()
        if proc.returncode is None:
            proc.kill()
            await proc.wait()
        try:
            await websocket.close()
        except Exception:
            pass


@ws_router.websocket("/docker/exec/{container_id}")
async def exec_shell(websocket: WebSocket, container_id: str, token: str = Query("")):
    """Container içinde etkileşimli kabuk (bash varsa bash, yoksa sh)."""
    payload = await authorize_ws(websocket, token, admin=True)
    if not payload:
        return
    if not _REF_RE.match(container_id):
        await websocket.close(code=4400, reason="Geçersiz container")
        return
    await websocket.accept()
    argv = _runtime_cmd("exec", "-it", container_id, "sh", "-c",
                        "if command -v bash >/dev/null 2>&1; then exec bash; else exec sh; fi")
    recorder = Recorder(payload.get("username", "?"), f"docker exec {container_id}") if _recording_enabled() else None
    await run_pty(websocket, argv, recorder)
