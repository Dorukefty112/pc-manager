import json
import time
import uuid
import socket
import subprocess
import smtplib
import threading
import psutil
import shutil
import httpx
from email.mime.text import MIMEText
from pathlib import Path
from datetime import datetime
from fastapi import APIRouter, HTTPException

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


# ─── Kural motoru ─────────────────────────────────────────────────────────────
# Bir kural, koşulu `duration` saniye kesintisiz sağlandığında tetiklenir, koşul
# sürdükçe en fazla `cooldown` dakikada bir hatırlatır ve koşul ortadan kalkınca
# (notify_resolved açıksa) "düzeldi" bildirimi gönderir.

CHECK_INTERVAL = 30
HISTORY_LIMIT = 200

METRICS = {
    "cpu":     {"label": "CPU", "unit": "%", "needs_threshold": True},
    "memory":  {"label": "RAM", "unit": "%", "needs_threshold": True},
    "swap":    {"label": "Swap", "unit": "%", "needs_threshold": True},
    "disk":    {"label": "Disk", "unit": "%", "needs_threshold": True, "target": "Bağlama noktası (örn. /)"},
    "temp":    {"label": "Sıcaklık", "unit": "°C", "needs_threshold": True},
    "load":    {"label": "Yük (1 dk)", "unit": "", "needs_threshold": True},
    "service": {"label": "Servis durdu", "unit": "", "needs_threshold": False, "target": "systemd birimi (örn. nginx)"},
    "process": {"label": "Süreç çalışmıyor", "unit": "", "needs_threshold": False, "target": "Süreç adı (örn. postgres)"},
    "http":    {"label": "HTTP erişilemiyor", "unit": "", "needs_threshold": False, "target": "URL (örn. http://localhost:3000)"},
}

_rule_state: dict[str, dict] = {}
_state_lock = threading.Lock()


def default_rules(notif: dict) -> list[dict]:
    """alert_rules tanımlı değilse eski eşik ayarlarından kurallar üret."""
    return [
        {"id": "default-cpu", "name": "Yüksek CPU", "metric": "cpu", "op": ">",
         "threshold": notif.get("cpu_threshold", 90), "duration": 120, "cooldown": 30,
         "enabled": True, "notify_resolved": True},
        {"id": "default-memory", "name": "Yüksek RAM", "metric": "memory", "op": ">",
         "threshold": notif.get("memory_threshold", 90), "duration": 120, "cooldown": 30,
         "enabled": True, "notify_resolved": True},
        {"id": "default-disk", "name": "Disk doluyor", "metric": "disk", "op": ">",
         "threshold": notif.get("disk_threshold", 90), "duration": 0, "cooldown": 360,
         "target": "/", "enabled": True, "notify_resolved": True},
    ]


def get_rules(cfg: dict | None = None) -> list[dict]:
    cfg = cfg if cfg is not None else _load_config()
    if "alert_rules" in cfg:
        return cfg["alert_rules"]
    return default_rules(cfg.get("notifications", {}))


def validate_rule(rule: dict) -> dict:
    metric = rule.get("metric")
    if metric not in METRICS:
        raise ValueError(f"Geçersiz metrik: {metric}")
    spec = METRICS[metric]
    out = {
        "id": str(rule.get("id") or uuid.uuid4().hex[:10]),
        "name": (rule.get("name") or spec["label"]).strip()[:80],
        "metric": metric,
        "op": rule.get("op", ">") if rule.get("op") in (">", "<") else ">",
        "threshold": float(rule.get("threshold") or 0),
        "duration": max(0, int(rule.get("duration") or 0)),
        "cooldown": max(1, int(rule.get("cooldown") or 30)),
        "target": (rule.get("target") or "").strip()[:300],
        "enabled": bool(rule.get("enabled", True)),
        "notify_resolved": bool(rule.get("notify_resolved", True)),
    }
    if "target" in spec and metric != "disk" and not out["target"]:
        raise ValueError(f"{spec['label']} kuralı için hedef gerekli")
    if metric == "http" and not out["target"].startswith(("http://", "https://")):
        raise ValueError("HTTP hedefi http:// veya https:// ile başlamalı")
    if metric == "disk" and not out["target"]:
        out["target"] = "/"
    return out


def _max_temp():
    try:
        temps = psutil.sensors_temperatures() or {}
    except (AttributeError, OSError):
        return None
    values = [e.current for entries in temps.values() for e in entries if e.current]
    return max(values) if values else None


def read_rule(rule: dict) -> tuple[bool | None, str]:
    """(koşul sağlandı mı, okunabilir değer). Okunamıyorsa koşul None."""
    m = rule["metric"]
    if m in ("cpu", "memory", "swap", "disk", "temp", "load"):
        if m == "cpu":
            value = psutil.cpu_percent(interval=None)
        elif m == "memory":
            value = psutil.virtual_memory().percent
        elif m == "swap":
            value = psutil.swap_memory().percent
        elif m == "disk":
            try:
                value = psutil.disk_usage(rule.get("target") or "/").percent
            except OSError:
                return None, "bağlama noktası okunamadı"
        elif m == "temp":
            value = _max_temp()
        else:
            value = psutil.getloadavg()[0]
        if value is None:
            return None, "veri yok"
        hit = value > rule["threshold"] if rule["op"] == ">" else value < rule["threshold"]
        return hit, f"{value:.1f}{METRICS[m]['unit']}"
    if m == "service":
        try:
            r = subprocess.run(["systemctl", "is-active", rule["target"]], capture_output=True, text=True, timeout=5)
            state = r.stdout.strip() or "unknown"
        except (OSError, subprocess.TimeoutExpired):
            return None, "systemctl çalıştırılamadı"
        return state != "active", state
    if m == "process":
        target = rule["target"].lower()
        running = any((p.info.get("name") or "").lower() == target for p in psutil.process_iter(["name"]))
        return not running, "çalışıyor" if running else "bulunamadı"
    if m == "http":
        try:
            resp = httpx.get(rule["target"], timeout=10, follow_redirects=True)
            return resp.status_code >= 400, f"HTTP {resp.status_code}"
        except httpx.HTTPError as e:
            return True, type(e).__name__
    return None, "?"


def _dispatch(subject: str, html_msg: str, channels: dict) -> list[str]:
    sent_to = []
    if channels.get("telegram", True) and _send_telegram(html_msg):
        sent_to.append("telegram")
    plain = html_msg.replace("<b>", "").replace("</b>", "")
    if channels.get("email", False) and _send_email(subject, plain):
        sent_to.append("email")
    if channels.get("webhook", False) and _send_webhook(plain):
        sent_to.append("webhook")
    return sent_to


def _record(entry: dict):
    history = _load_history()
    history.insert(0, entry)
    _save_history(history[:HISTORY_LIMIT])


def _notify(rule: dict, kind: str, value: str, since: float, now: float, channels: dict, send=_dispatch):
    host = socket.gethostname()
    label = METRICS[rule["metric"]]["label"]
    target = f" ({rule['target']})" if rule.get("target") else ""
    cond = ""
    if METRICS[rule["metric"]]["needs_threshold"]:
        cond = f" {rule['op']} {rule['threshold']:g}{METRICS[rule['metric']]['unit']}"
    if kind == "resolved":
        icon, title = "\u2705", "Düzeldi"
    elif kind == "repeat":
        icon, title = "\u26a0\ufe0f", "Devam ediyor"
    else:
        icon, title = "\U0001f6a8", "Alarm"
    minutes = int((now - since) // 60)
    msg = (
        f"{icon} <b>{title}: {rule['name']}</b>\n"
        f"Sunucu: {host}\n"
        f"{label}{target}{cond}\n"
        f"Değer: <b>{value}</b>"
        + (f"\nSüre: {minutes} dk" if minutes else "")
    )
    sent_to = send(f"[PC Manager] {title}: {rule['name']}", msg, channels)
    _record({
        "time": datetime.fromtimestamp(now).isoformat(),
        "type": label,
        "value": value,
        "threshold": rule.get("threshold"),
        "rule_id": rule["id"],
        "name": rule["name"],
        "state": "resolved" if kind == "resolved" else "firing",
        "sent_to": sent_to,
    })


def evaluate_rules(rules: list[dict], channels: dict, now: float | None = None,
                   reader=read_rule, send=_dispatch):
    now = now or time.time()
    active_ids = set()
    for rule in rules:
        if not rule.get("enabled", True):
            continue
        rid = rule["id"]
        active_ids.add(rid)
        try:
            hit, value = reader(rule)
        except Exception as e:
            hit, value = None, str(e)[:80]
        with _state_lock:
            st = _rule_state.setdefault(rid, {"since": None, "firing": False, "last_sent": 0})
            st.update(value=value, checked=now)
            if hit is None:
                continue
            if hit:
                if st["since"] is None:
                    st["since"] = now
                due = now - st["since"] >= rule.get("duration", 0)
                if due and not st["firing"]:
                    st.update(firing=True, last_sent=now)
                    kind = "fire"
                elif st["firing"] and now - st["last_sent"] >= rule.get("cooldown", 30) * 60:
                    st["last_sent"] = now
                    kind = "repeat"
                else:
                    continue
                since = st["since"]
            else:
                was_firing, since = st["firing"], st["since"] or now
                st.update(since=None, firing=False)
                if not (was_firing and rule.get("notify_resolved", True)):
                    continue
                kind = "resolved"
        _notify(rule, kind, value, since, now, channels, send)
    with _state_lock:
        for rid in list(_rule_state):
            if rid not in active_ids:
                _rule_state.pop(rid)


def _check_and_alert():
    cfg = _load_config()
    channels = cfg.get("notifications", {}).get("channels", {})
    evaluate_rules(get_rules(cfg), channels)


def start_checker():
    global _checker_running, _checker_thread
    if _checker_running:
        return
    _checker_running = True
    psutil.cpu_percent(interval=None)

    def loop():
        while _checker_running:
            time.sleep(CHECK_INTERVAL)
            try:
                _check_and_alert()
            except Exception:
                pass

    _checker_thread = threading.Thread(target=loop, daemon=True)
    _checker_thread.start()


def stop_checker():
    global _checker_running
    _checker_running = False


@router.get("/notifications/rules")
def list_rules():
    return {"rules": get_rules(), "metrics": METRICS}


@router.put("/notifications/rules")
def save_rules(body: dict):
    try:
        rules = [validate_rule(r) for r in body.get("rules", [])]
    except (ValueError, TypeError) as e:
        raise HTTPException(400, str(e))
    if len({r["id"] for r in rules}) != len(rules):
        raise HTTPException(400, "Kural kimlikleri benzersiz olmalı")
    cfg = _load_config()
    cfg["alert_rules"] = rules
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2, ensure_ascii=False))
    return {"rules": rules}


@router.get("/notifications/rules/state")
def rules_state():
    with _state_lock:
        return {rid: {k: v for k, v in st.items()} for rid, st in _rule_state.items()}


@router.post("/notifications/rules/check")
def check_rule(body: dict):
    """Kuralı kaydetmeden şu anki değeri dene."""
    try:
        rule = validate_rule(body)
    except (ValueError, TypeError) as e:
        raise HTTPException(400, str(e))
    hit, value = read_rule(rule)
    return {"hit": hit, "value": value}


@router.post("/notifications/test")
def send_test():
    channels = _load_config().get("notifications", {}).get("channels", {})
    sent = _dispatch("[PC Manager] Test bildirimi",
                     "\U0001f514 <b>PC Manager test bildirimi</b>\nBildirim kanalları çalışıyor.", channels)
    return {"success": bool(sent), "sent_to": sent}


@router.get("/notifications/history")
def get_history():
    return _load_history()


@router.delete("/notifications/history")
def clear_history():
    _save_history([])
    return {"success": True}
