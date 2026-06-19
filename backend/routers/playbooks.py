import os
import json
import time
import uuid
import asyncio
import subprocess
import threading
import shutil
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from .updates import _detect_pm

router = APIRouter(tags=["playbooks"])

DATA_DIR = Path(__file__).parent.parent
PLAYBOOKS_FILE = DATA_DIR / "playbooks.json"
RUNS_FILE = DATA_DIR / "playbook_runs.json"

active_runs: dict[str, dict] = {}

def _load_json(path, default=None):
    if path.exists():
        try:
            return json.loads(path.read_text())
        except Exception:
            pass
    return default if default is not None else []

def _save_json(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False))

def _get_playbooks():
    return _load_json(PLAYBOOKS_FILE, [])

def _save_playbooks(pbs):
    _save_json(PLAYBOOKS_FILE, pbs)

def _get_runs():
    return _load_json(RUNS_FILE, [])

def _save_runs(runs):
    _save_json(RUNS_FILE, runs)


@router.get("/playbooks")
def list_playbooks(search: str = ""):
    pbs = _get_playbooks()
    if search:
        s = search.lower()
        pbs = [p for p in pbs if s in p.get("name", "").lower() or s in p.get("description", "").lower()]
    return pbs


@router.post("/playbooks")
def create_playbook(pb: dict):
    if not pb.get("name"):
        raise HTTPException(400, "name is required")
    pbs = _get_playbooks()
    now = datetime.now(timezone.utc).isoformat()
    pb["id"] = str(uuid.uuid4())
    pb["created_at"] = now
    pb["updated_at"] = now
    pb.setdefault("description", "")
    pb.setdefault("steps", [])
    pbs.append(pb)
    _save_playbooks(pbs)
    return pb


@router.get("/playbooks/runs")
def list_runs():
    runs = _get_runs()
    return list(reversed(runs))


@router.get("/playbooks/runs/{execution_id}")
def get_run(execution_id: str):
    if execution_id in active_runs:
        return active_runs[execution_id]
    runs = _get_runs()
    for r in runs:
        if r["execution_id"] == execution_id:
            return r
    raise HTTPException(404, "Run not found")


@router.get("/playbooks/{playbook_id}")
def get_playbook(playbook_id: str):
    pbs = _get_playbooks()
    for pb in pbs:
        if pb["id"] == playbook_id:
            return pb
    raise HTTPException(404, "Playbook not found")


@router.put("/playbooks/{playbook_id}")
def update_playbook(playbook_id: str, data: dict):
    pbs = _get_playbooks()
    for i, pb in enumerate(pbs):
        if pb["id"] == playbook_id:
            data.pop("id", None)
            data.pop("created_at", None)
            pb.update(data)
            pb["updated_at"] = datetime.now(timezone.utc).isoformat()
            pbs[i] = pb
            _save_playbooks(pbs)
            return pb
    raise HTTPException(404, "Playbook not found")


@router.delete("/playbooks/{playbook_id}")
def delete_playbook(playbook_id: str):
    pbs = _get_playbooks()
    for i, pb in enumerate(pbs):
        if pb["id"] == playbook_id:
            pbs.pop(i)
            _save_playbooks(pbs)
            return {"success": True}
    raise HTTPException(404, "Playbook not found")


def _run_step(step):
    start = time.time()
    result = {
        "status": "running",
        "output": "",
        "exit_code": None,
        "duration": 0,
    }
    try:
        if step["type"] == "command":
            r = subprocess.run(step.get("cmd", ""), shell=True, capture_output=True, text=True, timeout=60)
            out = r.stdout or ""
            err = r.stderr or ""
            result["output"] = (out[:2000] + ("\n" + err[:500] if err else ""))[:2500]
            result["exit_code"] = r.returncode
            result["status"] = "success" if r.returncode == 0 else "failed"

        elif step["type"] == "service":
            action = step.get("action", "status")
            name = step.get("name", "")
            r = subprocess.run(["systemctl", action, name], capture_output=True, text=True, timeout=30)
            result["output"] = (r.stdout or r.stderr)[:2000]
            result["exit_code"] = r.returncode
            result["status"] = "success" if r.returncode == 0 else "failed"

        elif step["type"] == "package":
            action = step.get("action", "install")
            name = step.get("name", "")
            pm = _detect_pm()
            if not pm:
                result["output"] = "No package manager found"
                result["exit_code"] = 1
                result["status"] = "failed"
            else:
                pm_actions = {
                    "install": [pm, "-y", "install", name],
                    "remove": [pm, "-y", "remove", name],
                }
                cmd = pm_actions.get(action, pm_actions["install"])
                r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
                result["output"] = (r.stdout or r.stderr)[:2000]
                result["exit_code"] = r.returncode
                result["status"] = "success" if r.returncode == 0 else "failed"

        elif step["type"] == "file":
            action = step.get("action", "write")
            path = step.get("path", "")
            if action == "write":
                content = step.get("content", "")
                os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
                with open(path, "w") as f:
                    f.write(content)
                result["output"] = f"Written {len(content)} bytes to {path}"
                result["exit_code"] = 0
                result["status"] = "success"
            elif action == "delete":
                if os.path.exists(path):
                    os.remove(path)
                    result["output"] = f"Deleted {path}"
                    result["exit_code"] = 0
                    result["status"] = "success"
                else:
                    result["output"] = f"File not found: {path}"
                    result["exit_code"] = 1
                    result["status"] = "failed"

        elif step["type"] == "wait":
            seconds = step.get("seconds", 1)
            time.sleep(seconds)
            result["output"] = f"Waited {seconds}s"
            result["exit_code"] = 0
            result["status"] = "success"

        elif step["type"] == "webhook":
            url = step.get("url", "")
            method = step.get("method", "GET").upper()
            body = step.get("body")
            try:
                import httpx
                if method == "GET":
                    r = httpx.get(url, timeout=15)
                elif method == "POST":
                    r = httpx.post(url, json=body, timeout=15) if body else httpx.post(url, timeout=15)
                else:
                    r = httpx.request(method, url, timeout=15)
                result["output"] = f"HTTP {r.status_code}: {r.text[:1000]}"
                result["exit_code"] = 0 if r.status_code < 400 else 1
                result["status"] = "success" if r.status_code < 400 else "failed"
            except Exception as e:
                result["output"] = str(e)[:500]
                result["exit_code"] = 1
                result["status"] = "failed"

    except subprocess.TimeoutExpired:
        result["output"] = "Command timed out"
        result["exit_code"] = -1
        result["status"] = "failed"
    except Exception as e:
        result["output"] = str(e)[:500]
        result["exit_code"] = 1
        result["status"] = "failed"

    result["duration"] = round(time.time() - start, 2)
    return result


def _execute_playbook(execution_id: str, playbook: dict):
    runs = _get_runs()
    run_data = None
    for r in runs:
        if r["execution_id"] == execution_id:
            run_data = r
            break
    if run_data is None:
        return

    steps = playbook.get("steps", [])
    for i, step in enumerate(steps):
        step_result = _run_step(step)
        step_info = step_result.copy()
        step_info["step"] = i + 1
        step_info["type"] = step["type"]
        step_info["command"] = step.get("cmd", step.get("name", step.get("path", step.get("url", ""))))
        run_data["steps"][i] = step_info
        run_data["current_step"] = i + 1
        run_data["total_steps"] = len(steps)
        active_runs[execution_id] = dict(run_data)
        _save_runs(runs)

        if step_result["status"] == "failed":
            run_data["status"] = "failed"
            run_data["error_step"] = i + 1
            run_data["ended_at"] = datetime.now(timezone.utc).isoformat()
            active_runs[execution_id] = dict(run_data)
            _save_runs(runs)
            return

    run_data["status"] = "success"
    run_data["ended_at"] = datetime.now(timezone.utc).isoformat()
    active_runs[execution_id] = dict(run_data)
    _save_runs(runs)


@router.post("/playbooks/{playbook_id}/run")
def run_playbook(playbook_id: str):
    pbs = _get_playbooks()
    playbook = None
    for pb in pbs:
        if pb["id"] == playbook_id:
            playbook = pb
            break
    if not playbook:
        raise HTTPException(404, "Playbook not found")

    execution_id = str(uuid.uuid4())
    steps = playbook.get("steps", [])
    now = datetime.now(timezone.utc).isoformat()
    run_data = {
        "execution_id": execution_id,
        "playbook_id": playbook_id,
        "playbook_name": playbook.get("name", ""),
        "status": "running",
        "started_at": now,
        "ended_at": None,
        "current_step": 0,
        "total_steps": len(steps),
        "error_step": None,
        "steps": [
            {
                "step": i + 1,
                "type": s.get("type", ""),
                "command": s.get("cmd", s.get("name", s.get("path", s.get("url", "")))),
                "status": "pending",
                "output": "",
                "exit_code": None,
                "duration": 0,
            }
            for i, s in enumerate(steps)
        ],
    }

    runs = _get_runs()
    runs.append(run_data)
    _save_runs(runs)
    active_runs[execution_id] = dict(run_data)

    t = threading.Thread(target=_execute_playbook, args=(execution_id, playbook), daemon=True)
    t.start()

    return {"execution_id": execution_id, "status": "started"}


@router.websocket("/playbooks/runs/{execution_id}/ws")
async def run_websocket(websocket: WebSocket, execution_id: str):
    await websocket.accept()
    try:
        while True:
            data = active_runs.get(execution_id)
            if data:
                await websocket.send_json(data)
                if data["status"] in ("success", "failed"):
                    break
            else:
                runs = _get_runs()
                found = None
                for r in runs:
                    if r["execution_id"] == execution_id:
                        found = r
                        break
                if found:
                    await websocket.send_json(found)
                    if found["status"] in ("success", "failed"):
                        break
                else:
                    await websocket.send_json({"error": "not found"})
                    break
            await asyncio.sleep(0.5)
    except WebSocketDisconnect:
        pass
