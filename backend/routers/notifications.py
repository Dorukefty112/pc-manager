import json
import time
import smtplib
import threading
import psutil
import shutil
import httpx
from email.mime.text import MIMEText
from pathlib import Path
from datetime import datetime
from fastapi import APIRouter

router = APIRouter(tags=["notifications"])
CONFIG_PATH = Path(__file__).parent.parent / "config.json"
HISTORY_PATH = Path(__file__).parent.parent / "alert_history.json"

_checker_running = False
_checker_thread = None


def _load_config():
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH) as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _save_history(alerts):
    try:
        HISTORY_PATH.write_text(json.dumps(alerts, indent=2, ensure_ascii=False))
    except Exception:
        pass


def _load_history():
    if HISTORY_PATH.exists():
        try:
            return json.loads(HISTORY_PATH.read_text())
        except Exception:
            pass
    return []


def _send_telegram(msg):
    cfg = _load_config().get("telegram", {})
    token = cfg.get("bot_token", "").strip()
    chat_id = cfg.get("chat_id", "").strip()
    if not token or not chat_id:
        return False
    try:
        resp = httpx.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": msg, "parse_mode": "HTML"},
            timeout=10,
        )
        return resp.status_code == 200
    except Exception:
        return False


def _send_email(subject, body):
    cfg = _load_config().get("email", {})
    if not cfg.get("enabled") or not cfg.get("smtp_server") or not cfg.get("from_addr") or not cfg.get("to_addr"):
        return False
    try:
        msg = MIMEText(body, "plain", "utf-8")
        msg["Subject"] = subject
        msg["From"] = cfg["from_addr"]
        msg["To"] = cfg["to_addr"]
        port = cfg.get("smtp_port", 587)
        use_tls = cfg.get("use_tls", True)
        if use_tls:
            with smtplib.SMTP(cfg["smtp_server"], port) as s:
                s.starttls()
                if cfg.get("smtp_user") and cfg.get("smtp_password"):
                    s.login(cfg["smtp_user"], cfg["smtp_password"])
                s.send_message(msg)
        else:
            with smtplib.SMTP(cfg["smtp_server"], port) as s:
                if cfg.get("smtp_user") and cfg.get("smtp_password"):
                    s.login(cfg["smtp_user"], cfg["smtp_password"])
                s.send_message(msg)
        return True
    except Exception:
        return False


def _send_webhook(msg):
    cfg = _load_config().get("webhook", {})
    url = cfg.get("url", "").strip()
    if not cfg.get("enabled") or not url:
        return False
    try:
        resp = httpx.post(url, json={"text": msg, "subject": "PC Manager Uyarisi"}, timeout=10)
        return resp.status_code < 500
    except Exception:
        return False


def _check_and_alert():
    cfg = _load_config()
    notif = cfg.get("notifications", {})
    channels = notif.get("channels", {})

    cpu_t = notif.get("cpu_threshold", 90)
    mem_t = notif.get("memory_threshold", 90)
    disk_t = notif.get("disk_threshold", 90)

    cpu = psutil.cpu_percent(interval=0)
    mem = psutil.virtual_memory().percent
    disk = shutil.disk_usage("/").used / shutil.disk_usage("/").total * 100

    alerts = []

    if cpu >= cpu_t:
        alerts.append(("CPU", f"%{cpu:.0f}", cpu_t))
    if mem >= mem_t:
        alerts.append(("RAM", f"%{mem:.0f}", mem_t))
    if disk >= disk_t:
        alerts.append(("Disk", f"%{disk:.0f}", disk_t))

    if not alerts:
        return

    history = _load_history()
    now = datetime.now().isoformat()
    hostname = __import__("socket").gethostname()

    for name, val, threshold in alerts:
        msg = (
            f"\u26a0\ufe0f <b>PC Manager Uyarisi</b>\n"
            f"Sunucu: {hostname}\n"
            f"<b>{name}</b>: {val} (esik: %{threshold})"
        )

        sent_to = []
        if channels.get("telegram", True):
            if _send_telegram(msg):
                sent_to.append("telegram")
        if channels.get("email", False):
            if _send_email(f"[PC Manager] {name} Uyarisi: {val}", msg.replace("<b>", "").replace("</b>", "")):
                sent_to.append("email")
        if channels.get("webhook", False):
            if _send_webhook(msg):
                sent_to.append("webhook")

        history.insert(0, {
            "time": now,
            "type": name,
            "value": val,
            "threshold": threshold,
            "sent_to": sent_to,
        })

    history[:100]
    _save_history(history)


def start_checker():
    global _checker_running, _checker_thread
    if _checker_running:
        return
    _checker_running = True

    def loop():
        while _checker_running:
            try:
                _check_and_alert()
            except Exception:
                pass
            time.sleep(30)

    _checker_thread = threading.Thread(target=loop, daemon=True)
    _checker_thread.start()


def stop_checker():
    global _checker_running
    _checker_running = False


@router.get("/notifications/history")
def get_history():
    return _load_history()


@router.delete("/notifications/history")
def clear_history():
    _save_history([])
    return {"success": True}
