import json
from pathlib import Path
from fastapi import APIRouter
import httpx

router = APIRouter(tags=["telegram"])
CONFIG_PATH = Path(__file__).parent.parent / "config.json"

API_BASE = "https://api.telegram.org/bot"


def _load_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH) as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            pass
    return {}


def _get_telegram_config() -> dict:
    cfg = _load_config()
    return cfg.get("telegram", {"bot_token": "", "chat_id": ""})


async def send_telegram(message: str, silent: bool = False) -> bool:
    cfg = _get_telegram_config()
    token = cfg.get("bot_token", "").strip()
    chat_id = cfg.get("chat_id", "").strip()
    if not token or not chat_id:
        return False
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{API_BASE}{token}/sendMessage",
                json={
                    "chat_id": chat_id,
                    "text": message,
                    "parse_mode": "HTML",
                    "disable_notification": silent,
                },
                timeout=10,
            )
        return resp.status_code == 200
    except Exception:
        return False


def send_telegram_sync(message: str, silent: bool = False) -> bool:
    cfg = _get_telegram_config()
    token = cfg.get("bot_token", "").strip()
    chat_id = cfg.get("chat_id", "").strip()
    if not token or not chat_id:
        return False
    try:
        resp = httpx.post(
            f"{API_BASE}{token}/sendMessage",
            json={
                "chat_id": chat_id,
                "text": message,
                "parse_mode": "HTML",
                "disable_notification": silent,
            },
            timeout=10,
        )
        return resp.status_code == 200
    except Exception:
        return False


@router.post("/telegram/test")
async def test_telegram():
    ok = await send_telegram(
        "\u26a0\ufe0f <b>PC Manager Test Mesaji</b>\n"
        "Telegram bildirim sistemi basariyla calisiyor."
    )
    if ok:
        return {"success": True, "message": "Test mesaji gonderildi"}
    cfg = _get_telegram_config()
    if not cfg.get("bot_token") or not cfg.get("chat_id"):
        return {"success": False, "message": "Bot token veya Chat ID eksik"}
    return {"success": False, "message": "Mesaj gonderilemedi. Token veya Chat ID hatali olabilir."}
