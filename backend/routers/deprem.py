import re
import time
import json
import math
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
import httpx

router = APIRouter()

ISTANBUL_LAT = 41.0082
ISTANBUL_LON = 28.9784
KANDILLI_URL = "http://www.koeri.boun.edu.tr/scripts/lst0.asp"
AFAD_URL = "https://deprem.afad.gov.tr/apiv2/event/filter"

MAG_WARNING = 3.0
MAG_ALERT = 4.0
MAG_CRITICAL = 5.0


class Deprem:
    def __init__(self, tarih, saat, enlem, boylam, derinlik, md, ml, mw, yer, cozum=""):
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
            self.datetime = datetime.strptime(f"{tarih} {saat}", "%Y.%m.%d %H:%M:%S")
        except ValueError:
            self.datetime = datetime.now()

    def to_dict(self):
        uzaklik = haversine(self.enlem, self.boylam, ISTANBUL_LAT, ISTANBUL_LON)
        seviye = risk_seviyesi(self.magnitude, uzaklik)
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


def risk_seviyesi(mag, uzaklik):
    if mag < 0:
        return "BILINMIYOR"
    if mag >= MAG_CRITICAL and uzaklik < 200:
        return "KRITIK"
    elif mag >= MAG_ALERT and uzaklik < 150:
        return "YUKSEK"
    elif mag >= MAG_WARNING and uzaklik < 100:
        return "ORTA"
    elif mag >= MAG_WARNING and 26.5 <= ISTANBUL_LON <= 30.5 and 40.5 <= ISTANBUL_LAT <= 41.5:
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
    depremler = []
    for item in data.get("data", []):
        try:
            ts = item.get("eventDate", "")[:19].replace("T", " ")
            tarih = ts[:10].replace("-", ".")
            saat = ts[11:19]
            enlem = float(item.get("latitude", 0))
            boylam = float(item.get("longitude", 0))
            derinlik = float(item.get("depth", 0))
            mag = float(item.get("magnitude", -1))
            yer = item.get("location", "").strip()
            depremler.append(Deprem(tarih, saat, enlem, boylam, derinlik, -1.0, mag, -1.0, yer, "AFAD"))
        except (ValueError, KeyError, TypeError):
            continue
    return depremler


def _son_dk(deprem, dakika=3):
    return (datetime.now() - deprem.datetime) < timedelta(minutes=dakika)


@router.get("/deprem/son")
def son_depremler():
    depremler = fetch_kandilli()
    if not depremler:
        depremler = fetch_afad()
    depremler.sort(key=lambda d: d.datetime, reverse=True)
    return [d.to_dict() for d in depremler[:30]]


@router.get("/deprem/uyari")
def deprem_uyarilari():
    depremler = fetch_kandilli()
    if not depremler:
        depremler = fetch_afad()
    uyarilar = []
    for d in depremler:
        if _son_dk(d, 5):
            uyarilar.append(d.to_dict())
    return uyarilar


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
            except Exception:
                yield f"data: {json.dumps({'error': 'fetch failed'})}\n\n"
            await asyncio.sleep(15)

    return StreamingResponse(event_stream(), media_type="text/event-stream")
