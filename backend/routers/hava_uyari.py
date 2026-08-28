import json
import time
import threading
from pathlib import Path
from fastapi import APIRouter, Query
import httpx

from disaster_utils import IL_MERKEZLERI
from .telegram import send_telegram_sync

router = APIRouter()

CONFIG_PATH = Path(__file__).parent.parent / "config.json"

# NOT: MGM'nin resmi/dokümante edilmiş bir açık API'si yok. Bu, meteouyari
# haritasının kendi AngularJS istemcisinin çağırdığı gayri-resmi uç nokta -
# Referer başlığı olmadan "Not allowed by MGM" hatası dönüyor. Şema MGM
# tarafından değiştirilirse tüm varsayımlar tek bir _parse_mgm_response()
# fonksiyonunda izole, sadece orası düzeltilmesi yeterli olacak.
MGM_TODAY_URL = "https://servis.mgm.gov.tr/web/meteoalarm/today"
MGM_TOMORROW_URL = "https://servis.mgm.gov.tr/web/meteoalarm/tomorrow"
MGM_REFERER = "https://www.mgm.gov.tr/meteouyari/turkiye.aspx"
MGM_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
    "Referer": MGM_REFERER,
    "Accept": "application/json, text/plain, */*",
}

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

SEVIYE_MAP = {
    "sarı": "DIKKAT", "sari": "DIKKAT", "yellow": "DIKKAT",
    "turuncu": "YUKSEK", "orange": "YUKSEK",
    "kırmızı": "KRITIK", "kirmizi": "KRITIK", "red": "KRITIK",
}

# MGM'nin "towns" dizisindeki sayısal merkez kimlikleri PPDD formatında:
# 9 + il plaka kodu (2 hane) + ilçe içi sıra no (2 hane), örn. 90101 -> plaka 01
# (Adana), 91401 -> plaka 14 (Bolu). IL_MERKEZLERI sözlüğü de tam olarak resmi
# plaka kodu sırasında tanımlı (Adana=1 ... Düzce=81), bu yüzden plaka kodunu
# doğrudan bu listenin indeksine çevirebiliyoruz.
_IL_PLAKA_SIRASI = list(IL_MERKEZLERI.keys())

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


def _il_from_town_id(town_id) -> str | None:
    try:
        tid = int(town_id)
    except (TypeError, ValueError):
        return None
    plaka = (tid // 100) % 100
    if 1 <= plaka <= len(_IL_PLAKA_SIRASI):
        return _IL_PLAKA_SIRASI[plaka - 1]
    return None


def _fetch_mgm_raw(url: str) -> str:
    resp = httpx.get(url, timeout=15, headers=MGM_HEADERS)
    if resp.status_code != 200 or not resp.text.strip():
        raise MgmParseError(f"MGM yanıt vermedi (status={resp.status_code})")
    return resp.text


def _parse_mgm_response(raw_text: str, zaman: str = "bugün") -> list:
    """MGM JSON'unu normalize eder. Şema resmi olarak dokümante edilmediği için
    beklenen yapı bulunamazsa MgmParseError fırlatır (çağıran taraf bunu
    Open-Meteo fallback'ine düşer)."""
    try:
        data = json.loads(raw_text)
    except (json.JSONDecodeError, TypeError) as e:
        raise MgmParseError(f"JSON ayrıştırılamadı: {e}")

    color_groups: dict[str, list] = {}
    if isinstance(data, dict):
        for key in ("yellow", "orange", "red", "sari", "sarı", "turuncu", "kirmizi", "kırmızı"):
            value = data.get(key)
            if isinstance(value, list):
                color_groups[key.lower()] = value
        if not color_groups:
            raise MgmParseError("Beklenen renk anahtarları (yellow/orange/red) bulunamadı")
    elif isinstance(data, list):
        for item in data:
            if not isinstance(item, dict):
                continue
            level = str(item.get("level") or item.get("color") or item.get("renk") or item.get("seviye") or "").lower()
            if not level:
                continue
            color_groups.setdefault(level, []).append(item)
        if not color_groups:
            raise MgmParseError("Liste ögelerinde renk/level alanı bulunamadı")
    else:
        raise MgmParseError("Beklenmeyen JSON kök tipi")

    warnings = []
    for color_key, items in color_groups.items():
        seviye = SEVIYE_MAP.get(color_key)
        if not seviye:
            continue
        for item in items:
            if not isinstance(item, dict):
                continue
            tur = item.get("text") or item.get("weather") or item.get("type") or "Bilinmiyor"
            begin = item.get("begin") or item.get("start")
            end = item.get("end") or item.get("bitis")
            towns = item.get("towns") or []
            iller = set()
            for tid in towns:
                il = _il_from_town_id(tid)
                if il:
                    iller.add(il)
            for il in sorted(iller):
                warnings.append({
                    "il": il,
                    "seviye": seviye,
                    "tur": tur,
                    "baslangic": begin,
                    "bitis": end,
                    "kaynak": "MGM",
                    "zaman": zaman,
                })
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
        raw_today = _fetch_mgm_raw(MGM_TODAY_URL)
        warnings = _parse_mgm_response(raw_today, zaman="bugün")
    except MgmParseError:
        return _derive_warnings_from_open_meteo()
    except Exception:
        return _derive_warnings_from_open_meteo()

    try:
        raw_tomorrow = _fetch_mgm_raw(MGM_TOMORROW_URL)
        warnings = warnings + _parse_mgm_response(raw_tomorrow, zaman="yarın")
    except Exception:
        pass
    return warnings


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
