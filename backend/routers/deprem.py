import re
import time
import json
import math
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
import httpx

router = APIRouter()

ISTANBUL_LAT = 41.0082
ISTANBUL_LON = 28.9784
KANDILLI_URL = "http://www.koeri.boun.edu.tr/scripts/lst0.asp"
AFAD_URL = "https://servisnet.afad.gov.tr/apigateway/deprem/apiv2/event/filter"
SISMIK_API_URL = "https://sismikharita.com/api.php"
SISMIK_STATS_URL = "https://sismikharita.com/stats_api.php"
SISMIK_STATION_URL = "https://sismikharita.com/station_api.php"
SISMIK_DETAIL_URL = "https://sismikharita.com/deprem_api.php"

MAG_WARNING = 3.0
MAG_ALERT = 4.0
MAG_CRITICAL = 5.0


class Deprem:
    def __init__(self, tarih, saat, enlem, boylam, derinlik, md, ml, mw, yer, cozum="", is_utc=False):
        self.tarih = tarih
        self.saat = saat
        self.enlem = enlem
        self.boylam = boylam
        self.derinlik = derinlik
        magnitudes = [m for m in [md, ml, mw] if m >= 0]
        self.magnitude = max(magnitudes) if magnitudes else -1.0
        self.yer = yer.strip()
        self.cozum = cozum.strip()
        try:
            dt = datetime.strptime(f"{tarih} {saat}", "%Y.%m.%d %H:%M:%S")
            if is_utc:
                self.datetime = dt.replace(tzinfo=timezone.utc)
            else:
                self.datetime = dt.replace(tzinfo=timezone(timedelta(hours=3)))
        except ValueError:
            self.datetime = datetime.now(timezone.utc)

    def to_dict(self):
        uzaklik = haversine(self.enlem, self.boylam, ISTANBUL_LAT, ISTANBUL_LON)
        seviye = risk_seviyesi(self.magnitude, uzaklik, self.enlem, self.boylam)
        return {
            "tarih": self.tarih,
            "saat": self.saat,
            "enlem": round(self.enlem, 4),
            "boylam": round(self.boylam, 4),
            "derinlik": round(self.derinlik, 1),
            "magnitude": round(self.magnitude, 1) if self.magnitude >= 0 else -1,
            "yer": self.yer,
            "istanbula_uzaklik": round(uzaklik, 1),
            "risk_seviyesi": seviye,
        }


def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def risk_seviyesi(mag, uzaklik, enlem=None, boylam=None):
    if mag < 0:
        return "BILINMIYOR"
    if mag >= MAG_CRITICAL and uzaklik < 200:
        return "KRITIK"
    elif mag >= MAG_ALERT and uzaklik < 150:
        return "YUKSEK"
    elif mag >= MAG_WARNING and uzaklik < 100:
        return "ORTA"
    elif mag >= MAG_WARNING and enlem and boylam and 26.5 <= boylam <= 30.5 and 40.5 <= enlem <= 41.5:
        return "DIKKAT"
    return "BILGI"


def _parse_mag(val):
    val = val.strip().replace("-.-", "-1").replace("--", "-1")
    try:
        return float(val)
    except ValueError:
        return -1.0


def _parse_row(line):
    line = line.rstrip()
    if len(line) < 85 or not line[0:1].isdigit():
        return None
    tarih = line[0:10].strip()
    saat = line[11:19].strip()
    enlem_str = line[20:29].strip()
    boylam_str = line[29:39].strip()
    derinlik_str = line[39:55].strip()
    md_str = line[55:59].strip()
    ml_str = line[59:64].strip()
    mw_str = line[64:69].strip()
    yer = line[69:].strip()
    if not tarih or not saat or not enlem_str:
        return None
    try:
        enlem = float(enlem_str)
        boylam = float(boylam_str)
    except ValueError:
        return None
    try:
        derinlik = float(derinlik_str.split()[0]) if derinlik_str else 0.0
    except (ValueError, IndexError):
        derinlik = 0.0
    md = _parse_mag(md_str)
    ml = _parse_mag(ml_str)
    mw = _parse_mag(mw_str)
    cozum = ""
    for k in ["ILKSEL", "REVIZE", "ONCEL", "DUZELT"]:
        if k in yer.upper():
            i = yer.upper().index(k)
            cozum = yer[i:].strip()
            yer = yer[:i].strip()
            break
    return Deprem(tarih, saat, enlem, boylam, derinlik, md, ml, mw, yer, cozum)


def fetch_kandilli():
    try:
        resp = httpx.get(KANDILLI_URL, timeout=15)
        resp.encoding = "iso-8859-9"
    except Exception:
        return []
    depremler = []
    for line in resp.text.split("\n"):
        line = line.strip()
        if not line:
            continue
        d = _parse_row(line)
        if d:
            depremler.append(d)
    return depremler


def fetch_afad(dakika=120):
    try:
        now = datetime.utcnow()
        start = now - timedelta(minutes=dakika)
        resp = httpx.get(AFAD_URL, params={
            "start": start.strftime("%Y-%m-%d %H:%M:%S"),
            "end": now.strftime("%Y-%m-%d %H:%M:%S"),
            "minmag": 0, "order": "timedesc", "limit": 50,
        }, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return []

    if isinstance(data, dict):
        items = data.get("data", [])
    elif isinstance(data, list):
        items = data
    else:
        items = []

    if not isinstance(items, list):
        return []

    depremler = []
    for item in items:
        try:
            ts = item.get("eventDate", "")[:19].replace("T", " ")
            tarih = ts[:10].replace("-", ".")
            saat = ts[11:19]
            enlem = float(item.get("latitude", 0))
            boylam = float(item.get("longitude", 0))
            derinlik = float(item.get("depth", 0))
            mag = float(item.get("magnitude", -1))
            yer = item.get("location", "").strip()
            depremler.append(Deprem(tarih, saat, enlem, boylam, derinlik, -1.0, mag, -1.0, yer, "AFAD", is_utc=True))
        except (ValueError, KeyError, TypeError):
            continue
    return depremler


# ─── Sismik Harita API ────────────────────────────────────────────────────────

def _safe_float(val, default=-1.0):
    """Virgüllü veya noktalı float değerlerini güvenli şekilde dönüştürür."""
    if val is None or val == "" or val == "-":
        return default
    try:
        return float(str(val).replace(",", "."))
    except (ValueError, TypeError):
        return default


def _normalize_sismik_record(item: dict) -> dict:
    """Sismik Harita API kaydını normalize eder ve zenginleştirir."""
    occurred_at = item.get("occurred_at", "")
    try:
        dt = datetime.strptime(occurred_at[:19], "%Y-%m-%d %H:%M:%S")
        tarih = dt.strftime("%Y.%m.%d")
        saat = dt.strftime("%H:%M:%S")
    except Exception:
        tarih = occurred_at[:10]
        saat = occurred_at[11:19] if len(occurred_at) > 10 else "00:00:00"

    enlem = _safe_float(item.get("latitude"), 0.0)
    boylam = _safe_float(item.get("longitude"), 0.0)
    derinlik = _safe_float(item.get("depth_km"), 0.0)

    mag = _safe_float(item.get("magnitude"))
    mag_ml = _safe_float(item.get("magnitude_ml"))
    mag_md = _safe_float(item.get("magnitude_md"))
    mag_mw = _safe_float(item.get("magnitude_mw"))

    # En büyük geçerli büyüklük değerini bul
    mags = {k: v for k, v in {"M": mag, "Ml": mag_ml, "Md": mag_md, "Mw": mag_mw}.items() if v > 0}
    best_mag = max(mags.values()) if mags else -1.0
    best_mag_type = max(mags, key=mags.get) if mags else "M"

    uzaklik = haversine(enlem, boylam, ISTANBUL_LAT, ISTANBUL_LON)
    seviye = risk_seviyesi(best_mag, uzaklik, enlem, boylam)

    # Kaynak listesi
    sources_raw = item.get("sources", [])
    sources_normalized = []
    if isinstance(sources_raw, list):
        for s in sources_raw:
            sources_normalized.append({
                "name": s.get("name", ""),
                "magnitude": _safe_float(s.get("magnitude")),
                "quality": s.get("quality", ""),
                "depth_km": _safe_float(s.get("depth_km")),
                "location": s.get("location", ""),
                "time_diff": s.get("time_diff", 0),
            })

    return {
        # Temel bilgiler
        "id": item.get("id"),
        "sismik_id": item.get("sismik_id", ""),
        "event_id": item.get("event_id", ""),
        "occurred_at": occurred_at,
        "tarih": tarih,
        "saat": saat,
        "enlem": round(enlem, 6),
        "boylam": round(boylam, 6),
        "derinlik": round(derinlik, 1),

        # Büyüklük
        "magnitude": round(best_mag, 2) if best_mag > 0 else -1,
        "magnitude_type": best_mag_type,
        "magnitude_ml": round(mag_ml, 2) if mag_ml > 0 else None,
        "magnitude_md": round(mag_md, 2) if mag_md > 0 else None,
        "magnitude_mw": round(mag_mw, 2) if mag_mw > 0 else None,

        # Konum
        "yer": item.get("display_location") or item.get("location") or "",
        "geo_location": item.get("geo_location", ""),
        "location_raw": item.get("location", ""),

        # Kalite & Kaynak
        "quality": item.get("quality", "automatic"),
        "source": item.get("source", ""),
        "is_primary": item.get("is_primary", True),
        "sources": sources_normalized,

        # Uyarı & Etki
        "tsunami": bool(item.get("tsunami", 0)),
        "felt_count": item.get("felt_count") or item.get("emsc_testimony_count") or 0,
        "pager_alert": item.get("pager_alert") or "",
        "mmi": item.get("mmi") or None,

        # Hesaplanan
        "istanbula_uzaklik": round(uzaklik, 1),
        "risk_seviyesi": seviye,
    }


def fetch_sismikharita(
    limit: int = 100,
    min_magnitude: float = 0.0,
    sources: str = "",
    date_from: str = "",
    date_to: str = "",
) -> List[dict]:
    """Sismik Harita API'sinden deprem listesi çeker ve normalize eder."""
    params = {"limit": min(limit, 1000)}
    if min_magnitude > 0:
        params["min_magnitude"] = min_magnitude
    if sources:
        params["sources"] = sources
    if date_from:
        params["date_from"] = date_from
    if date_to:
        params["date_to"] = date_to

    try:
        resp = httpx.get(SISMIK_API_URL, params=params, timeout=15, headers={
            "User-Agent": "PC-Manager/1.0 (https://github.com/Dorukefty112/pc-manager)"
        })
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return []

    if data.get("status") != "success":
        return []

    earthquakes = data.get("earthquakes", [])
    if not isinstance(earthquakes, list):
        return []

    return [_normalize_sismik_record(item) for item in earthquakes]


def fetch_sismikharita_stats() -> dict:
    """Sismik Harita istatistiklerini döner."""
    try:
        resp = httpx.get(SISMIK_STATS_URL, timeout=10, headers={
            "User-Agent": "PC-Manager/1.0"
        })
        resp.raise_for_status()
        data = resp.json()
        if data.get("status") == "success":
            return {
                "total": data.get("total", 0),
                "today": data.get("today", 0),
                "avg_magnitude": _safe_float(data.get("avg_magnitude"), 0.0),
                "max_magnitude": _safe_float(data.get("max_magnitude"), 0.0),
            }
    except Exception:
        pass
    return {"total": 0, "today": 0, "avg_magnitude": 0.0, "max_magnitude": 0.0}


def fetch_sismikharita_stations(source: str = "afad") -> list:
    """Sismik Harita'dan sismik istasyon konumlarını döner."""
    try:
        resp = httpx.get(SISMIK_STATION_URL, params={"source": source}, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        if data.get("status") == "success":
            return data.get("stations", [])
    except Exception:
        pass
    return []


# ─── Eski yardımcılar ────────────────────────────────────────────────────────

def _son_dk(deprem, dakika=3):
    now = datetime.now(timezone.utc)
    if deprem.datetime.tzinfo is None:
        deprem.datetime = deprem.datetime.replace(tzinfo=timezone.utc)
    return (now - deprem.datetime) < timedelta(minutes=dakika)


# ─── Endpoint'ler ─────────────────────────────────────────────────────────────

@router.get("/deprem/son")
def son_depremler():
    """Geriye uyumluluk için korunmuş Kandilli/AFAD endpoint'i."""
    depremler = fetch_kandilli()
    if not depremler:
        depremler = fetch_afad()
    depremler.sort(key=lambda d: d.datetime, reverse=True)
    return [d.to_dict() for d in depremler[:30]]


@router.get("/deprem/sismik")
def sismik_depremler(
    limit: int = Query(default=100, ge=1, le=1000),
    min_magnitude: float = Query(default=0.0, ge=0.0),
    sources: str = Query(default=""),
    date_from: str = Query(default=""),
    date_to: str = Query(default=""),
):
    """
    Sismik Harita API'sinden zenginleştirilmiş deprem listesi döner.
    - limit: Sonuç sayısı (maks 1000)
    - min_magnitude: Minimum büyüklük filtresi
    - sources: Virgülle ayrılmış kaynak filtreleri (kandilli, afad, usgs, noa, vb.)
    - date_from / date_to: Tarih aralığı (YYYY-MM-DD)
    """
    depremler = fetch_sismikharita(
        limit=limit,
        min_magnitude=min_magnitude,
        sources=sources,
        date_from=date_from,
        date_to=date_to,
    )
    if not depremler:
        # Yedek: eski Kandilli/AFAD
        kandilli = fetch_kandilli() or fetch_afad()
        return [d.to_dict() for d in sorted(kandilli, key=lambda x: x.datetime, reverse=True)[:limit]]
    return depremler


@router.get("/deprem/sismik/stats")
def sismik_stats():
    """Sismik Harita platformunun genel istatistiklerini döner."""
    return fetch_sismikharita_stats()


@router.get("/deprem/sismik/stations")
def sismik_stations(source: str = Query(default="afad")):
    """Sismik istasyon konumlarını döner. source: 'afad' veya 'kandilli'"""
    return fetch_sismikharita_stations(source=source)


@router.get("/deprem/sismik/detail/{deprem_id}")
def sismik_detail(deprem_id: int):
    """Belirli bir depremin detaylı bilgilerini döner."""
    try:
        resp = httpx.get(SISMIK_DETAIL_URL, params={"id": deprem_id}, timeout=10)
        resp.raise_for_status()
        return resp.json()
    except Exception:
        return {"error": "Detay bilgisi alınamadı"}


@router.get("/deprem/uyari")
def deprem_uyarilari():
    depremler = fetch_kandilli()
    if not depremler:
        depremler = fetch_afad()
    uyarilar = []
    for d in depremler:
        if _son_dk(d, 5):
            uyarilar.append(d.to_dict())
    _telegram_alert(depremler)
    return uyarilar


_gonderilen = set()
_MIN_MAG = 2.0
_MAX_DIST = 300


def _deprem_anahtar(d):
    return f"{d.tarih}_{d.saat}_{d.yer}_{d.magnitude:.1f}"


def _telegram_alert(depremler):
    global _gonderilen
    from .telegram import send_telegram_sync

    yeni = []
    for d in depremler:
        if not _son_dk(d, 3):
            continue
        uzaklik = haversine(d.enlem, d.boylam, ISTANBUL_LAT, ISTANBUL_LON)
        if d.magnitude < _MIN_MAG or uzaklik > _MAX_DIST:
            continue
        anahtar = _deprem_anahtar(d)
        if anahtar in _gonderilen:
            continue
        _gonderilen.add(anahtar)
        risk = risk_seviyesi(d.magnitude, uzaklik, d.enlem, d.boylam)
        yeni.append((d, risk, uzaklik))

    if not yeni:
        return

    if len(_gonderilen) > 1000:
        _gonderilen = set(list(_gonderilen)[-500:])

    grup_baslik = "\U0001f514 <b>Son Depremler</b>"
    gruplar = []
    for d, risk, uzaklik in yeni:
        emoji_map = {"KRITIK": "\U0001f6a8", "YUKSEK": "\u26a0\ufe0f", "ORTA": "\U0001f7e1", "DIKKAT": "\U0001f535"}
        emoji = emoji_map.get(risk, "\u26aa")
        gruplar.append(
            f"{emoji} <b>M{d.magnitude:.1f}</b> | {risk}"
            f"\n\U0001f4cd {d.yer}"
            f"\n\U0001f4cf İstanbul'a {uzaklik:.1f} km, Derinlik {d.derinlik} km"
            f"\n\U0001f550 {d.tarih} {d.saat}"
        )

    for i in range(0, len(gruplar), 5):
        msg = grup_baslik + "\n\n" + "\n\n".join(gruplar[i:i+5])
        if not send_telegram_sync(msg):
            break


@router.get("/deprem/stream")
async def deprem_stream():
    import asyncio
    loop = asyncio.get_event_loop()

    async def event_stream():
        while True:
            try:
                depremler = await loop.run_in_executor(None, fetch_kandilli)
                if not depremler:
                    depremler = await loop.run_in_executor(None, fetch_afad)
                uyarilar = []
                for d in depremler:
                    if _son_dk(d, 3):
                        uyarilar.append(d.to_dict())
                data = json.dumps({"depremler": [d.to_dict() for d in depremler[:10]], "uyarilar": uyarilar}, ensure_ascii=False)
                yield f"data: {data}\n\n"
                _telegram_alert(depremler)
            except Exception:
                yield f"data: {json.dumps({'error': 'fetch failed'})}\n\n"
            await asyncio.sleep(15)

    return StreamingResponse(event_stream(), media_type="text/event-stream")
