import csv
import io
import json
import time
import threading
from pathlib import Path
from datetime import datetime, timedelta
from fastapi import APIRouter, Query
import httpx

from disaster_utils import haversine, IL_MERKEZLERI
from .telegram import send_telegram_sync

router = APIRouter()

CONFIG_PATH = Path(__file__).parent.parent / "config.json"
FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api/country/csv"
FIRE_SENSOR = "VIIRS_NOAA20_NRT"
COUNTRY_CODE = "TUR"

_seen_fires = set()
_checker_running = False
_checker_thread = None


def _load_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text())
        except Exception:
            pass
    return {}


def _get_api_key() -> str:
    return _load_config().get("firms", {}).get("api_key", "").strip()


def _confidence_score(raw) -> float:
    if raw is None:
        return 0.0
    s = str(raw).strip().lower()
    if s in ("h", "high"):
        return 90.0
    if s in ("n", "nominal"):
        return 60.0
    if s in ("l", "low"):
        return 20.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def risk_seviyesi(frp: float, confidence_score: float) -> str:
    if confidence_score >= 80 and frp >= 50:
        return "KRITIK"
    elif confidence_score >= 80 or frp >= 30:
        return "YUKSEK"
    elif confidence_score >= 50:
        return "ORTA"
    return "DIKKAT"


def _nearest_il(lat: float, lon: float):
    best_name, best_dist = None, None
    for name, (il_lat, il_lon) in IL_MERKEZLERI.items():
        d = haversine(lat, lon, il_lat, il_lon)
        if best_dist is None or d < best_dist:
            best_name, best_dist = name, d
    return best_name, round(best_dist, 1) if best_dist is not None else None


def _parse_firms_csv(text: str) -> list:
    """FIRMS CSV -> normalize edilmiş yangın kayıtları. Boş/bozuk veride [] döner, exception fırlatmaz."""
    if not text or not text.strip():
        return []
    records = []
    try:
        reader = csv.DictReader(io.StringIO(text))
        for row in reader:
            try:
                lat = float(row.get("latitude"))
                lon = float(row.get("longitude"))
            except (TypeError, ValueError):
                continue
            frp = float(row.get("frp") or 0)
            confidence_raw = row.get("confidence")
            confidence_score = _confidence_score(confidence_raw)
            il, uzaklik = _nearest_il(lat, lon)
            records.append({
                "id": f"{lat:.4f}_{lon:.4f}_{row.get('acq_date','')}_{row.get('acq_time','')}",
                "enlem": round(lat, 4),
                "boylam": round(lon, 4),
                "brightness": row.get("bright_ti4") or row.get("brightness"),
                "frp": round(frp, 1),
                "confidence": confidence_raw,
                "confidence_score": confidence_score,
                "acq_date": row.get("acq_date"),
                "acq_time": row.get("acq_time"),
                "satellite": row.get("satellite"),
                "instrument": row.get("instrument"),
                "daynight": row.get("daynight"),
                "il": il,
                "il_uzaklik_km": uzaklik,
                "risk_seviyesi": risk_seviyesi(frp, confidence_score),
            })
    except Exception:
        return []
    return records


def _fetch_fires(gun_araligi: int = 1) -> list:
    api_key = _get_api_key()
    if not api_key:
        return []
    gun_araligi = max(1, min(10, gun_araligi))
    url = f"{FIRMS_BASE}/{api_key}/{FIRE_SENSOR}/{COUNTRY_CODE}/{gun_araligi}"
    try:
        resp = httpx.get(url, timeout=20)
        if resp.status_code != 200:
            return []
        return _parse_firms_csv(resp.text)
    except Exception:
        return []


def _check_and_alert():
    global _seen_fires
    cfg = _load_config()
    fires = _fetch_fires(gun_araligi=1)
    for f in fires:
        if f["id"] in _seen_fires:
            continue
        _seen_fires.add(f["id"])
        if f["risk_seviyesi"] in ("KRITIK", "YUKSEK"):
            msg = (
                f"\U0001f525 <b>Orman Yangını Tespit Edildi</b>\n"
                f"Konum: {f['il'] or 'Bilinmiyor'} yakını (~{f['il_uzaklik_km']} km)\n"
                f"Güç (FRP): {f['frp']} MW\n"
                f"Risk: {f['risk_seviyesi']}\n"
                f"Kaynak: NASA FIRMS ({f['satellite'] or FIRE_SENSOR})"
            )
            send_telegram_sync(msg)
    if len(_seen_fires) > 5000:
        _seen_fires = set(list(_seen_fires)[-2000:])


def start_fire_checker():
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
            time.sleep(20 * 60)

    _checker_thread = threading.Thread(target=loop, daemon=True)
    _checker_thread.start()


def stop_fire_checker():
    global _checker_running
    _checker_running = False


@router.get("/yangin/aktif")
def get_active_fires(gun: int = Query(1, ge=1, le=10)):
    if not _get_api_key():
        return {"fires": [], "error": "FIRMS API anahtarı ayarlanmamış (Ayarlar > Genel)"}
    return {"fires": _fetch_fires(gun_araligi=gun)}


@router.get("/yangin/stats")
def get_fire_stats(gun: int = Query(1, ge=1, le=10)):
    fires = _fetch_fires(gun_araligi=gun) if _get_api_key() else []
    if not fires:
        return {"toplam": 0, "kritik": 0, "yuksek": 0, "ortalama_frp": 0, "maks_frp": 0, "etkilenen_iller": []}
    frps = [f["frp"] for f in fires]
    iller = sorted({f["il"] for f in fires if f["il"]})
    return {
        "toplam": len(fires),
        "kritik": sum(1 for f in fires if f["risk_seviyesi"] == "KRITIK"),
        "yuksek": sum(1 for f in fires if f["risk_seviyesi"] == "YUKSEK"),
        "ortalama_frp": round(sum(frps) / len(frps), 1),
        "maks_frp": round(max(frps), 1),
        "etkilenen_iller": iller,
    }
