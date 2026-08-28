import json
import time
import asyncio
import threading
from pathlib import Path
from fastapi import APIRouter
import httpx

from .telegram import send_telegram_sync

router = APIRouter()

CONFIG_PATH = Path(__file__).parent.parent / "config.json"
FLOOD_API = "https://flood-api.open-meteo.com/v1/flood"

# Türkiye'nin taşkına eğilimli büyük nehir noktaları (deneysel izleme referans noktaları)
NEHIR_NOKTALARI = {
    "Seyhan (Adana)": (36.99, 35.33),
    "Meriç (Edirne)": (41.66, 26.55),
    "Kızılırmak (Bafra)": (41.57, 35.90),
    "Fırat (Birecik)": (37.03, 37.98),
    "Dicle (Diyarbakır)": (37.91, 40.23),
    "Sakarya (Adapazarı)": (40.78, 30.40),
    "Yeşilırmak (Çarşamba)": (41.20, 36.72),
}

_seen_alerts = set()
_checker_running = False
_checker_thread = None


def _load_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text())
        except Exception:
            pass
    return {}


def _percentile(values: list, pct: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    idx = max(0, min(len(s) - 1, int(round((pct / 100) * (len(s) - 1)))))
    return s[idx]


def risk_seviyesi(ratio: float) -> str:
    if ratio >= 1.5:
        return "KRITIK"
    elif ratio >= 1.2:
        return "YUKSEK"
    elif ratio >= 1.0:
        return "ORTA"
    return "NORMAL"


async def _fetch_point(client: httpx.AsyncClient, name: str, lat: float, lon: float, percentile: int) -> dict:
    params = {
        "latitude": lat,
        "longitude": lon,
        "daily": "river_discharge",
        "past_days": 92,
        "forecast_days": 3,
    }
    try:
        resp = await client.get(FLOOD_API, params=params, timeout=20)
        if resp.status_code != 200:
            return {"nokta": name, "enlem": lat, "boylam": lon, "hata": "Veri alınamadı"}
        data = resp.json()
        daily = data.get("daily", {})
        discharges = [v for v in daily.get("river_discharge", []) if isinstance(v, (int, float))]
        if not discharges:
            return {"nokta": name, "enlem": lat, "boylam": lon, "hata": "Debi verisi yok"}
        guncel = discharges[-1]
        esik = _percentile(discharges[:-3] if len(discharges) > 3 else discharges, percentile)
        oran = round(guncel / esik, 2) if esik > 0 else 0
        return {
            "nokta": name,
            "enlem": lat,
            "boylam": lon,
            "guncel_debi": round(guncel, 1),
            "esik_debi": round(esik, 1),
            "oran": oran,
            "risk_seviyesi": risk_seviyesi(oran),
        }
    except Exception:
        return {"nokta": name, "enlem": lat, "boylam": lon, "hata": "Veri alınamadı"}


async def _fetch_all_points(percentile: int = 90) -> list:
    async with httpx.AsyncClient() as client:
        tasks = [_fetch_point(client, name, lat, lon, percentile) for name, (lat, lon) in NEHIR_NOKTALARI.items()]
        return await asyncio.gather(*tasks)


def _check_and_alert():
    global _seen_alerts
    cfg = _load_config()
    percentile = cfg.get("notifications", {}).get("flood_discharge_percentile", 90)
    results = asyncio.run(_fetch_all_points(percentile))
    for r in results:
        if r.get("risk_seviyesi") not in ("KRITIK", "YUKSEK"):
            continue
        key = f"{r['nokta']}_{r['risk_seviyesi']}"
        if key in _seen_alerts:
            continue
        _seen_alerts.add(key)
        msg = (
            f"\U0001f30a <b>Taşkın Riski Tespit Edildi</b>\n"
            f"Nokta: {r['nokta']}\n"
            f"Güncel debi: {r['guncel_debi']} m³/s (normalin {r['oran']}x'i)\n"
            f"Risk: {r['risk_seviyesi']}\n"
            f"Kaynak: Open-Meteo Flood API (deneysel, resmi bir AFAD/DSİ uyarısı değildir)"
        )
        send_telegram_sync(msg)
    if len(_seen_alerts) > 200:
        _seen_alerts.clear()


def start_flood_checker():
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
            time.sleep(60 * 60)

    _checker_thread = threading.Thread(target=loop, daemon=True)
    _checker_thread.start()


def stop_flood_checker():
    global _checker_running
    _checker_running = False


@router.get("/sel/aktif")
async def get_flood_status():
    cfg = _load_config()
    percentile = cfg.get("notifications", {}).get("flood_discharge_percentile", 90)
    results = await _fetch_all_points(percentile)
    return {"noktalar": results}
