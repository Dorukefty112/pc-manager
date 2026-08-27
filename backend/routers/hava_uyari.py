import json
import time
import threading
import xml.etree.ElementTree as ET
from pathlib import Path
from fastapi import APIRouter, Query
import httpx

from disaster_utils import IL_MERKEZLERI
from .telegram import send_telegram_sync

router = APIRouter()

CONFIG_PATH = Path(__file__).parent.parent / "config.json"

# NOT: MGM'nin resmi/dokümante edilmiş bir açık API'si yok. Bu, sitenin kendi
# istemci tarafı JS'inin çağırdığı gayri-resmi bir uç nokta - şema DOĞRULANMADI,
# canlıda MGM tarafı değişirse sadece _parse_mgm_response() düzeltilmesi yeterli
# olacak şekilde tüm varsayımlar bu tek fonksiyonda izole edildi.
MGM_UYARI_URL = "https://www.mgm.gov.tr/tahminler-meteouyari.xml"
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

SEVIYE_MAP = {
    "sarı": "DIKKAT", "sari": "DIKKAT", "yellow": "DIKKAT",
    "turuncu": "YUKSEK", "orange": "YUKSEK",
    "kırmızı": "KRITIK", "kirmizi": "KRITIK", "red": "KRITIK",
}

_seen_alerts = set()
_checker_running = False
_checker_thread = None


class MgmParseError(Exception):
    pass


def _load_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text())
        except Exception:
            pass
    return {}


def _fetch_mgm_raw() -> str:
    resp = httpx.get(MGM_UYARI_URL, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
    if resp.status_code != 200 or not resp.text.strip():
        raise MgmParseError(f"MGM yanıt vermedi (status={resp.status_code})")
    return resp.text


def _parse_mgm_response(raw_text: str) -> list:
    """MGM XML'ini normalize eder. Şema doğrulanmadı - beklenmeyen yapı bulursa
    MgmParseError fırlatır (çağıran taraf bunu Open-Meteo fallback'ine düşer)."""
    try:
        root = ET.fromstring(raw_text)
    except ET.ParseError as e:
        raise MgmParseError(f"XML ayrıştırılamadı: {e}")

    warnings = []
    # Olası eleman adlarını dene (il/kod/seviye/tur alan adları MGM'de farklı olabilir)
    candidates = list(root.iter())
    found_any_item = False
    for el in candidates:
        tag = el.tag.lower().split("}")[-1]
        if tag not in ("item", "uyari", "warning", "record", "row"):
            continue
        found_any_item = True
        data = {child.tag.lower().split("}")[-1]: (child.text or "").strip() for child in el}
        il = data.get("il") or data.get("sehir") or data.get("city") or data.get("name")
        seviye_raw = (data.get("seviye") or data.get("level") or data.get("renk") or data.get("color") or "").lower()
        tur = data.get("tur") or data.get("type") or data.get("hazard") or "Bilinmiyor"
        if not il or seviye_raw not in SEVIYE_MAP:
            continue
        warnings.append({
            "il": il,
            "seviye": SEVIYE_MAP[seviye_raw],
            "tur": tur,
            "baslangic": data.get("baslangic") or data.get("start"),
            "bitis": data.get("bitis") or data.get("end"),
            "kaynak": "MGM",
        })

    if not found_any_item:
        raise MgmParseError("Beklenen XML yapısı bulunamadı (şema değişmiş olabilir)")
    return warnings


def _derive_warnings_from_open_meteo() -> list:
    """MGM erişilemezse/ayrıştırılamazsa yedek: 81 il için tek istekte ham
    tahmin verisi çekip basit eşiklerle kendi 'uyarımızı' türetiyoruz."""
    names = list(IL_MERKEZLERI.keys())
    lats = ",".join(str(IL_MERKEZLERI[n][0]) for n in names)
    lons = ",".join(str(IL_MERKEZLERI[n][1]) for n in names)
    try:
        resp = httpx.get(OPEN_METEO_URL, params={
            "latitude": lats, "longitude": lons,
            "daily": "windspeed_10m_max,precipitation_sum",
            "forecast_days": 2,
        }, timeout=20)
        if resp.status_code != 200:
            return []
        data = resp.json()
        # Çoklu koordinatta Open-Meteo bir liste döner; tek koordinatta tek obje döner
        results = data if isinstance(data, list) else [data]
    except Exception:
        return []

    warnings = []
    for il, r in zip(names, results):
        daily = r.get("daily", {}) if isinstance(r, dict) else {}
        wind = (daily.get("windspeed_10m_max") or [0])[0] or 0
        rain = (daily.get("precipitation_sum") or [0])[0] or 0
        if wind >= 70 or rain >= 70:
            seviye = "KRITIK"
        elif wind >= 50 or rain >= 50:
            seviye = "YUKSEK"
        elif wind >= 35 or rain >= 30:
            seviye = "DIKKAT"
        else:
            continue
        tur = "Fırtına" if wind >= rain else "Yoğun Yağış"
        warnings.append({
            "il": il, "seviye": seviye, "tur": tur,
            "baslangic": None, "bitis": None,
            "kaynak": "Open-Meteo (tahmini, MGM yedek)",
        })
    return warnings


def get_weather_warnings() -> list:
    try:
        raw = _fetch_mgm_raw()
        return _parse_mgm_response(raw)
    except MgmParseError:
        return _derive_warnings_from_open_meteo()
    except Exception:
        return _derive_warnings_from_open_meteo()


def _check_and_alert():
    cfg = _load_config()
    province = cfg.get("notifications", {}).get("weather_province", "").strip()
    warnings = get_weather_warnings()
    for w in warnings:
        if province and w["il"].lower() != province.lower():
            continue
        if w["seviye"] not in ("KRITIK", "YUKSEK"):
            continue
        key = f"{w['il']}_{w['tur']}_{w['seviye']}"
        if key in _seen_alerts:
            continue
        _seen_alerts.add(key)
        msg = (
            f"⛈️ <b>Hava Durumu Uyarısı</b>\n"
            f"İl: {w['il']}\n"
            f"Tür: {w['tur']}\n"
            f"Seviye: {w['seviye']}\n"
            f"Kaynak: {w['kaynak']}"
        )
        send_telegram_sync(msg)
    if len(_seen_alerts) > 500:
        _seen_alerts.clear()


def start_weather_checker():
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
            time.sleep(30 * 60)

    _checker_thread = threading.Thread(target=loop, daemon=True)
    _checker_thread.start()


def stop_weather_checker():
    global _checker_running
    _checker_running = False


@router.get("/hava/uyarilar")
def get_warnings(il: str = Query(None)):
    warnings = get_weather_warnings()
    if il:
        warnings = [w for w in warnings if w["il"].lower() == il.lower()]
    return {"uyarilar": warnings}


@router.get("/hava/stats")
def get_stats():
    warnings = get_weather_warnings()
    return {
        "toplam": len(warnings),
        "kritik": sum(1 for w in warnings if w["seviye"] == "KRITIK"),
        "yuksek": sum(1 for w in warnings if w["seviye"] == "YUKSEK"),
        "etkilenen_iller": sorted({w["il"] for w in warnings}),
    }
