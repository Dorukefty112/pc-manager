"""Android (Termux) için psutil uyumluluk katmanı.

Android 8+ uygulamaların /proc/stat okumasını, Android 10+ ise /proc/net/*
okumasını SELinux ile engelliyor. psutil'in CPU yüzdesi, açılış zamanı, ağ
sayaçları, yük ortalaması gibi fonksiyonları bu dosyalara dayandığı için
root'suz bir telefonda PermissionError fırlatıyor ve bunları kullanan her
uç nokta 500 veriyordu.

install() yalnızca Android'de çalışır ve ilgili psutil fonksiyonlarını
sarmalar: önce gerçek fonksiyon denenir (root'lu cihazda ya da izin varsa
gerçek veri gelir); başarısız olursa Android'de okunabilen bir kaynağa
(CLOCK_BOOTTIME, /sys/class/thermal, /sys/class/net, cpufreq) ya da
nötr bir değere düşülür. Uygulama kodunun geri kalanı değişmeden çalışır.
"""
import os
import sys
import glob
import time
import functools
from collections import namedtuple

import psutil

# psutil'in kendi tuple'larıyla aynı alan adları (çağıranlar alan adıyla erişiyor)
snetio = namedtuple("snetio", "bytes_sent bytes_recv packets_sent packets_recv errin errout dropin dropout")
scpufreq = namedtuple("scpufreq", "current min max")
shwtemp = namedtuple("shwtemp", "label current high critical")
sdiskpart = namedtuple("sdiskpart", "device mountpoint fstype opts")

_installed = False
_warned: set[str] = set()


def is_android() -> bool:
    return hasattr(sys, "getandroidapilevel") or "com.termux" in os.environ.get("PREFIX", "")


def _note(name: str, exc: Exception):
    if name not in _warned:
        _warned.add(name)
        print(f"[android-compat] {name} kullanılamıyor ({exc.__class__.__name__}); yedek kaynak kullanılıyor")


def _read(path: str) -> str | None:
    try:
        with open(path) as f:
            return f.read().strip()
    except OSError:
        return None


# ─── Yedek kaynaklar ─────────────────────────────────────────────────────────

def boot_time_fallback() -> float:
    try:
        return time.time() - time.clock_gettime(time.CLOCK_BOOTTIME)
    except (AttributeError, OSError):
        return time.time() - time.monotonic()


def _cpu_percent_fallback(interval=None, percpu=False):
    # Android'de sistem geneli CPU kullanımını okumanın root'suz bir yolu yok
    return [0.0] * (os.cpu_count() or 1) if percpu else 0.0


def _cpu_freq_fallback(percpu=False):
    freqs = []
    for cpu in sorted(glob.glob("/sys/devices/system/cpu/cpu[0-9]*/cpufreq")):
        cur, lo, hi = (_read(f"{cpu}/{n}") for n in ("scaling_cur_freq", "cpuinfo_min_freq", "cpuinfo_max_freq"))
        try:
            freqs.append(scpufreq(int(cur) / 1000, int(lo or 0) / 1000, int(hi or 0) / 1000))
        except (TypeError, ValueError):
            continue
    if percpu:
        return freqs
    if not freqs:
        return None
    return scpufreq(
        sum(f.current for f in freqs) / len(freqs),
        min(f.min for f in freqs),
        max(f.max for f in freqs),
    )


def _net_io_fallback(pernic=False, nowrap=True):
    per = {}
    for iface in glob.glob("/sys/class/net/*"):
        name = os.path.basename(iface)
        vals = [_read(f"{iface}/statistics/{k}") for k in (
            "tx_bytes", "rx_bytes", "tx_packets", "rx_packets", "rx_errors", "tx_errors", "rx_dropped", "tx_dropped")]
        try:
            per[name] = snetio(*(int(v) for v in vals))
        except (TypeError, ValueError):
            continue
    if pernic:
        return per
    total = [sum(getattr(n, f) for n in per.values()) for f in snetio._fields]
    return snetio(*total)


def _temps_fallback(fahrenheit=False):
    temps = []
    for zone in sorted(glob.glob("/sys/class/thermal/thermal_zone*")):
        raw, label = _read(f"{zone}/temp"), _read(f"{zone}/type") or os.path.basename(zone)
        try:
            value = int(raw)
        except (TypeError, ValueError):
            continue
        # Çekirdek milli-derece verir; bazı cihazlar doğrudan derece
        current = value / 1000 if abs(value) > 1000 else float(value)
        if -40 < current < 150:
            temps.append(shwtemp(label, current, None, None))
    return {"thermal": temps} if temps else {}


def _partitions_fallback(all=False):
    candidates = ["/", os.environ.get("HOME", ""), "/storage/emulated/0", "/sdcard"]
    parts, seen = [], set()
    for mp in candidates:
        if mp and os.path.isdir(mp):
            try:
                st = os.statvfs(mp)
            except OSError:
                continue
            key = (st.f_blocks, st.f_bsize)
            if key in seen:
                continue
            seen.add(key)
            parts.append(sdiskpart(mp, mp, "android", "rw"))
    return parts


FALLBACKS = {
    "cpu_percent": _cpu_percent_fallback,
    "cpu_freq": _cpu_freq_fallback,
    "boot_time": lambda: boot_time_fallback(),
    "net_io_counters": _net_io_fallback,
    "net_if_addrs": lambda: {},
    "net_if_stats": lambda: {},
    "net_connections": lambda kind="inet": [],
    "disk_io_counters": lambda perdisk=False, nowrap=True: {} if perdisk else None,
    "disk_partitions": _partitions_fallback,
    "sensors_temperatures": _temps_fallback,
    "sensors_fans": lambda: {},
    "sensors_battery": lambda: None,
    "getloadavg": lambda: (0.0, 0.0, 0.0),
    "users": lambda: [],
}

_CATCH = (OSError, RuntimeError, NotImplementedError, AttributeError, psutil.Error)


def _wrap(name, original, fallback):
    @functools.wraps(original)
    def safe(*args, **kwargs):
        try:
            return original(*args, **kwargs)
        except _CATCH as exc:
            _note(name, exc)
            return fallback(*args, **kwargs)
    safe.__android_compat__ = True
    return safe


def install(force: bool = False) -> bool:
    """Android'de psutil'i sarmalar. Tekrar çağrılırsa bir şey yapmaz."""
    global _installed
    if _installed or not (force or is_android()):
        return _installed
    for name, fallback in FALLBACKS.items():
        original = getattr(psutil, name, None)
        if original is None:
            setattr(psutil, name, fallback)
        elif not getattr(original, "__android_compat__", False):
            setattr(psutil, name, _wrap(f"psutil.{name}", original, fallback))

    # Process.create_time() psutil'in iç boot_time'ını çağırır; o da /proc/stat okur
    try:
        import psutil._pslinux as _linux
        if not getattr(_linux.boot_time, "__android_compat__", False):
            _linux.boot_time = _wrap("psutil._pslinux.boot_time", _linux.boot_time, boot_time_fallback)
    except ImportError:
        pass

    if not getattr(os.getloadavg, "__android_compat__", False):
        os.getloadavg = _wrap("os.getloadavg", os.getloadavg, lambda: (0.0, 0.0, 0.0))
    _installed = True
    return True
