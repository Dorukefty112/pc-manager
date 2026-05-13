import os
import json
from pathlib import Path
from fastapi import APIRouter

router = APIRouter(tags=["settings"])
CONFIG_PATH = Path(__file__).parent.parent / "config.json"

DEFAULT_CONFIG = {
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
