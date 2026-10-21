import pytest
from fastapi.testclient import TestClient
from routers import metrics
from main import app

client = TestClient(app)


@pytest.fixture
def temp_db(tmp_path, monkeypatch):
    monkeypatch.setattr(metrics, "DB_PATH", tmp_path / "metrics.db")
    return tmp_path / "metrics.db"


def _auth():
    tok = client.post("/api/auth/login", json={"password": "pcmanager"}).json()["token"]
    return {"Authorization": f"Bearer {tok}"}


def _fake(ts, cpu):
    return {"ts": ts, "cpu": cpu, "mem": 50.0, "swap": 0.0, "disk": 40.0, "load1": 1.0,
            "net_rx": 100.0, "net_tx": 50.0, "disk_read": None, "disk_write": None, "temp": None}


def test_take_sample_has_all_fields():
    s = metrics.take_sample()
    assert set(metrics.FIELDS) <= set(s)
    assert 0 <= s["cpu"] <= 100


def test_history_buckets_average_and_peak(temp_db):
    now = 1_700_000_000
    bucket = metrics.RANGES["24h"] // metrics.MAX_POINTS
    base = (now // bucket) * bucket - bucket  # tam bir kovanın başı
    for i, cpu in enumerate([10, 30, 50]):
        metrics.store_sample(_fake(base + i * 10, cpu))
    res = metrics.query_history("24h", now=now)
    assert res["bucket"] == bucket
    assert len(res["points"]) == 1
    p = res["points"][0]
    assert p["cpu"] == 30 and p["cpu_max"] == 50
    assert p["disk_read"] is None


def test_history_excludes_out_of_range(temp_db):
    now = 1_700_000_000
    metrics.store_sample(_fake(now - 7200, 99))
    metrics.store_sample(_fake(now - 60, 5))
    pts = metrics.query_history("1h", now=now)["points"]
    assert [p["cpu"] for p in pts] == [5]


def test_prune_drops_old_samples(temp_db):
    now = 1_700_000_000
    metrics.store_sample(_fake(now - 8 * 86400, 1))
    metrics.store_sample(_fake(now - 10, 2))
    conn = metrics._connect()
    metrics.prune(conn, now=now)
    assert conn.execute("SELECT COUNT(*) FROM samples").fetchone()[0] == 1
    conn.close()


def test_history_endpoint_validates_range(temp_db):
    assert client.get("/api/metrics/history?range=1y", headers=_auth()).status_code == 400
    assert client.get("/api/metrics/history?range=6h", headers=_auth()).status_code == 200


def test_prometheus_format(temp_db):
    metrics.store_sample(_fake(1_700_000_000, 12.5))
    res = client.get("/api/metrics/prometheus", headers=_auth())
    assert res.status_code == 200
    assert "# TYPE pcmanager_cpu_percent gauge" in res.text
    assert 'pcmanager_cpu_percent{host="' in res.text and "} 12.5" in res.text
