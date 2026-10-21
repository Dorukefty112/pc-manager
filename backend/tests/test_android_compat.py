"""Root'suz Android (Termux) kısıtlamalarını simüle eder.

Android 8+ /proc/stat'ı, Android 10+ /proc/net/*'ı uygulamalara kapatıyor;
systemctl, journalctl, crontab, docker gibi komutlar da yok. Bu testler,
bu koşullarda hiçbir uç noktanın 500 vermediğini ve arka plan işlerinin
(metrik örnekleyici, alarm kuralları) çalışmaya devam ettiğini doğrular.
"""
import os
import time
import psutil
import psutil._pslinux as pslinux
import pytest
from fastapi.testclient import TestClient

import android_compat
from main import app

client = TestClient(app, raise_server_exceptions=False)

BLOCKED = [
    "cpu_percent", "cpu_freq", "boot_time", "net_io_counters", "net_connections",
    "net_if_addrs", "net_if_stats", "disk_io_counters", "sensors_temperatures",
    "sensors_fans", "sensors_battery", "getloadavg", "users", "disk_partitions",
]

# Dış ağa çıkan veya ağır komut çalıştıran uç noktalar bu testin konusu değil
SKIP = ("deprem", "yangin", "/sel/", "hava", "search", "proxy", "speedtest", "ollama",
        "updates", "windows", "pentest", "debug", "chat", "hosts/status", "playbooks")


def _deny(name):
    def f(*args, **kwargs):
        raise PermissionError(13, "Permission denied", f"/proc ({name})")
    return f


@pytest.fixture
def android(monkeypatch):
    for name in BLOCKED:
        monkeypatch.setattr(psutil, name, _deny(name))
    monkeypatch.setattr(pslinux, "boot_time", _deny("_pslinux.boot_time"))
    monkeypatch.setattr(os, "getloadavg", _deny("os.getloadavg"))
    monkeypatch.setattr(android_compat, "_installed", False)
    android_compat.install(force=True)
    # Android'de systemctl/journalctl/crontab/docker yok
    monkeypatch.setenv("PATH", "/nonexistent")
    yield


def _headers():
    tok = client.post("/api/auth/login", json={"password": "pcmanager"}).json()["token"]
    return {"Authorization": f"Bearer {tok}"}


def test_no_endpoint_crashes_under_android_restrictions(android):
    h = _headers()
    failures = []
    for path, ops in app.openapi()["paths"].items():
        if "get" not in ops or not path.startswith("/api/") or "{" in path:
            continue
        if any(s in path for s in SKIP):
            continue
        r = client.get(path, headers=h)
        if r.status_code >= 500:
            failures.append(f"{path} -> {r.status_code}: {r.text[:120]}")
    assert not failures, "Android'de çöken uç noktalar:\n" + "\n".join(failures)


def test_background_jobs_survive(android):
    from routers import metrics, notifications
    sample = metrics.take_sample()
    assert sample["cpu"] == 0.0 and sample["mem"] is not None
    for metric in ("cpu", "memory", "load", "temp", "disk"):
        hit, _ = notifications.read_rule(notifications.validate_rule({"metric": metric, "threshold": 90}))
        assert hit in (True, False, None)
    assert client.get("/api/metrics/prometheus", headers=_headers()).status_code == 200


def test_boot_time_fallback_is_sane(android):
    bt = psutil.boot_time()
    assert 0 < bt <= time.time()
    # Process.create_time() psutil'in iç boot_time'ını kullanır
    assert psutil.Process().create_time() > bt - 1


def test_real_psutil_used_when_permitted(monkeypatch):
    """Root'lu cihazda / izin varken gerçek değer gelmeli, yedeğe düşülmemeli."""
    monkeypatch.setattr(android_compat, "_installed", False)
    monkeypatch.setattr(psutil, "boot_time", psutil.boot_time)
    real = psutil.boot_time()
    android_compat.install(force=True)
    assert abs(psutil.boot_time() - real) < 1


def test_default_shell_without_env(monkeypatch):
    from routers.terminal import default_shell
    monkeypatch.delenv("SHELL", raising=False)
    shell = default_shell()
    assert os.access(shell, os.X_OK)
