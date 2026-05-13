import os
import json
import hashlib
from pathlib import Path
from fastapi import APIRouter

router = APIRouter(tags=["settings"])
CONFIG_PATH = Path(__file__).parent.parent / "config.json"

DEFAULT_CONFIG = {
    "setup": {
        "completed": False,
        "site_name": "PC Manager",
        "admin_name": "",
    },
    "general": {
        "language": "tr",
    },
    "notifications": {
        "cpu_threshold": 90,
        "memory_threshold": 90,
        "disk_threshold": 90,
        "earthquake_magnitude": 4.0,
        "earthquake_distance": 100,
        "sound_enabled": True,
    },
    "ollama": {
        "model": "gemma4:e4b",
        "max_tool_rounds": 5,
    },
    "debug": {
        "enabled": False,
        "log_api_calls": True,
    },
}


def _load_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH) as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            pass
    return DEFAULT_CONFIG.copy()


def _save_config(cfg: dict):
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_PATH, "w") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)


@router.get("/settings")
def get_settings():
    return _load_config()


@router.put("/settings")
def update_settings(body: dict):
    current = _load_config()
    for key, value in body.items():
        if key in current and isinstance(value, dict):
            current[key].update(value)
        else:
            current[key] = value
    _save_config(current)
    return {"success": True, "settings": current}


@router.get("/setup")
def get_setup_status():
    cfg = _load_config()
    return {
        "completed": cfg.get("setup", {}).get("completed", False),
        "site_name": cfg.get("setup", {}).get("site_name", "PC Manager"),
        "admin_name": cfg.get("setup", {}).get("admin_name", ""),
    }


@router.post("/setup")
def complete_setup(body: dict):
    site_name = (body.get("site_name") or "PC Manager").strip()
    admin_name = (body.get("admin_name") or "").strip()
    password = body.get("password", "")

    if not password:
        password = "pcmanager"

    cfg = _load_config()
    cfg["setup"] = {
        "completed": True,
        "site_name": site_name,
        "admin_name": admin_name,
    }
    cfg["_password_hash"] = hashlib.sha256(password.encode()).hexdigest()
    _save_config(cfg)

    os.environ["PCMANAGER_PASSWORD_HASH"] = cfg["_password_hash"]

    return {"success": True, "site_name": site_name, "admin_name": admin_name}
