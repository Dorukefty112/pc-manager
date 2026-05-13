import os
import sys
import json
import time
import subprocess
from pathlib import Path
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from .settings import _load_config

router = APIRouter(tags=["debug"])

BASE = Path(__file__).parent.parent.parent


@router.get("/debug/info")
def debug_info():
    cfg = _load_config()
    env = {k: v for k, v in sorted(os.environ.items())
           if not k.startswith("PCMANAGER_SECRET") and not k.startswith("PCMANAGER_PASSWORD")}
    return {
        "debug_mode": cfg.get("debug", {}).get("enabled", False),
        "python": sys.version,
        "cwd": str(Path.cwd()),
        "base_dir": str(BASE),
        "config": cfg,
        "env": env,
        "timestamp": time.time(),
    }


@router.get("/debug/packages")
def debug_packages():
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "list", "--format=json"],
            capture_output=True, text=True, timeout=10
        )
        python_pkgs = json.loads(result.stdout) if result.returncode == 0 else []
    except Exception:
        python_pkgs = []
    try:
        result = subprocess.run(
            ["npm", "ls", "--depth=0", "--json"],
            capture_output=True, text=True, timeout=10,
            cwd=str(BASE / "frontend")
        )
        npm_pkgs = json.loads(result.stdout) if result.returncode == 0 else {}
    except Exception:
        npm_pkgs = {}
    return {
        "python_packages": python_pkgs[:50] if python_pkgs else [],
        "node_packages": list(npm_pkgs.get("dependencies", {}).keys()) if npm_pkgs else [],
    }


@router.get("/debug/logs")
def debug_logs(lines: int = 50):
    lines = min(lines, 200)
    journal = ["journalctl yok"]
    try:
        result = subprocess.run(
            ["journalctl", "-u", "pc-manager", "-n", str(lines), "--no-pager", "-o", "short-iso"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            journal = [l for l in result.stdout.strip().split("\n") if l.strip()]
    except Exception:
        pass
    return {"logs": journal[-lines:]}


@router.post("/debug/test-error")
def debug_test_error(body: dict = {}):
    msg = body.get("message", "Bu bir test hatasidir")
    raise RuntimeError(msg)
