"""Kalıcı metrik geçmişi.

Arka planda her SAMPLE_INTERVAL saniyede bir sistem örneği alınır ve SQLite'a
yazılır; RETENTION_DAYS'ten eski örnekler silinir. Geçmiş sorguları istenen
aralığı ~MAX_POINTS kovaya bölüp ortalama (CPU için ayrıca tepe) döndürür.
"""
import time
import socket
import sqlite3
import threading
import psutil
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from dependencies import require_auth

router = APIRouter(tags=["metrics"])

DB_PATH = Path(__file__).parent.parent / "metrics.db"
SAMPLE_INTERVAL = 10
RETENTION_DAYS = 7
MAX_POINTS = 240

RANGES = {"1h": 3600, "6h": 6 * 3600, "24h": 86400, "7d": 7 * 86400}
FIELDS = ("cpu", "mem", "swap", "disk", "load1", "net_rx", "net_tx", "disk_read", "disk_write", "temp")

_sampler_running = False
_last_counters: dict = {}
_db_lock = threading.Lock()


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(
        "CREATE TABLE IF NOT EXISTS samples (ts INTEGER PRIMARY KEY, "
        + ", ".join(f"{f} REAL" for f in FIELDS) + ")"
    )
    return conn


def _max_temp() -> float | None:
    try:
        temps = psutil.sensors_temperatures() or {}
    except (AttributeError, OSError):
        return None
    values = [e.current for entries in temps.values() for e in entries if e.current]
    return max(values) if values else None


def _rate(key: str, value: float, now: float) -> float | None:
    prev = _last_counters.get(key)
    _last_counters[key] = (value, now)
    if not prev or now <= prev[1] or value < prev[0]:
        return None
    return (value - prev[0]) / (now - prev[1])


def take_sample(now: float | None = None) -> dict:
    now = now or time.time()
    net = psutil.net_io_counters()
    try:
        dio = psutil.disk_io_counters()
    except (RuntimeError, OSError):
        dio = None
    try:
        load1 = psutil.getloadavg()[0]
    except (AttributeError, OSError):
        load1 = None
    return {
        "ts": int(now),
        "cpu": psutil.cpu_percent(interval=None),
        "mem": psutil.virtual_memory().percent,
        "swap": psutil.swap_memory().percent,
        "disk": psutil.disk_usage("/").percent,
        "load1": load1,
        "net_rx": _rate("net_rx", net.bytes_recv, now),
        "net_tx": _rate("net_tx", net.bytes_sent, now),
        "disk_read": _rate("disk_read", dio.read_bytes, now) if dio else None,
        "disk_write": _rate("disk_write", dio.write_bytes, now) if dio else None,
        "temp": _max_temp(),
    }


def store_sample(sample: dict, conn: sqlite3.Connection | None = None):
    own = conn is None
    conn = conn or _connect()
    try:
        with _db_lock:
            conn.execute(
                f"INSERT OR REPLACE INTO samples (ts, {', '.join(FIELDS)}) VALUES (?{', ?' * len(FIELDS)})",
                [sample["ts"], *[sample.get(f) for f in FIELDS]],
            )
            conn.commit()
    finally:
        if own:
            conn.close()


def prune(conn: sqlite3.Connection, now: float | None = None):
    cutoff = int((now or time.time()) - RETENTION_DAYS * 86400)
    with _db_lock:
        conn.execute("DELETE FROM samples WHERE ts < ?", (cutoff,))
        conn.commit()


def query_history(range_key: str, now: float | None = None) -> dict:
    if range_key not in RANGES:
        raise ValueError(range_key)
    span = RANGES[range_key]
    now = int(now or time.time())
    bucket = max(SAMPLE_INTERVAL, span // MAX_POINTS)
    start = now - span
    avgs = ", ".join(f"AVG({f})" for f in FIELDS)
    conn = _connect()
    try:
        rows = conn.execute(
            f"SELECT (ts / ?) * ? AS b, {avgs}, MAX(cpu) FROM samples "
            "WHERE ts >= ? GROUP BY b ORDER BY b",
            (bucket, bucket, start),
        ).fetchall()
    finally:
        conn.close()
    points = []
    for row in rows:
        p = {"t": row[0]}
        for i, f in enumerate(FIELDS, start=1):
            p[f] = round(row[i], 2) if row[i] is not None else None
        p["cpu_max"] = round(row[-1], 2) if row[-1] is not None else None
        points.append(p)
    return {"range": range_key, "bucket": bucket, "start": start, "end": now, "points": points}


def latest_sample() -> dict | None:
    conn = _connect()
    try:
        row = conn.execute(f"SELECT ts, {', '.join(FIELDS)} FROM samples ORDER BY ts DESC LIMIT 1").fetchone()
    finally:
        conn.close()
    if not row:
        return None
    return {"ts": row[0], **{f: row[i] for i, f in enumerate(FIELDS, start=1)}}


def start_sampler():
    global _sampler_running
    if _sampler_running:
        return
    _sampler_running = True

    def loop():
        conn = _connect()
        psutil.cpu_percent(interval=None)  # ilk çağrı her zaman 0 döner
        take_sample()  # sayaç tabanlı oranları başlat
        last_prune = 0
        while _sampler_running:
            time.sleep(SAMPLE_INTERVAL)
            try:
                store_sample(take_sample(), conn)
                if time.time() - last_prune > 3600:
                    prune(conn)
                    last_prune = time.time()
            except Exception:
                pass
        conn.close()

    threading.Thread(target=loop, daemon=True, name="metrics-sampler").start()


def stop_sampler():
    global _sampler_running
    _sampler_running = False


@router.get("/metrics/history")
def history(range: str = "1h", _: dict = Depends(require_auth)):
    try:
        return query_history(range)
    except ValueError:
        raise HTTPException(400, f"Geçersiz aralık. Seçenekler: {', '.join(RANGES)}")


@router.get("/metrics/latest")
def latest(_: dict = Depends(require_auth)):
    return latest_sample() or {}


PROM_HELP = {
    "cpu": ("pcmanager_cpu_percent", "CPU kullanımı (%)"),
    "mem": ("pcmanager_memory_percent", "RAM kullanımı (%)"),
    "swap": ("pcmanager_swap_percent", "Swap kullanımı (%)"),
    "disk": ("pcmanager_root_disk_percent", "Kök disk doluluğu (%)"),
    "load1": ("pcmanager_load1", "1 dakikalık yük ortalaması"),
    "net_rx": ("pcmanager_network_receive_bytes_per_second", "Ağ alım hızı"),
    "net_tx": ("pcmanager_network_transmit_bytes_per_second", "Ağ gönderim hızı"),
    "disk_read": ("pcmanager_disk_read_bytes_per_second", "Disk okuma hızı"),
    "disk_write": ("pcmanager_disk_write_bytes_per_second", "Disk yazma hızı"),
    "temp": ("pcmanager_temperature_max_celsius", "En sıcak sensör (°C)"),
}


@router.get("/metrics/prometheus", response_class=PlainTextResponse)
def prometheus(_: dict = Depends(require_auth)):
    """Prometheus metin formatı. Uzun ömürlü bir API token'ı ile scrape edin."""
    host = socket.gethostname().replace('"', "")
    sample = latest_sample() or take_sample()
    lines = []
    for field, (name, help_text) in PROM_HELP.items():
        value = sample.get(field)
        if value is None:
            continue
        lines += [f"# HELP {name} {help_text}", f"# TYPE {name} gauge", f'{name}{{host="{host}"}} {value}']
    mem = psutil.virtual_memory()
    net = psutil.net_io_counters()
    extra = [
        ("pcmanager_memory_total_bytes", "gauge", mem.total),
        ("pcmanager_uptime_seconds", "gauge", int(time.time() - psutil.boot_time())),
        ("pcmanager_network_receive_bytes_total", "counter", net.bytes_recv),
        ("pcmanager_network_transmit_bytes_total", "counter", net.bytes_sent),
    ]
    for name, kind, value in extra:
        lines += [f"# TYPE {name} {kind}", f'{name}{{host="{host}"}} {value}']
    return "\n".join(lines) + "\n"
