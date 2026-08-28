import asyncio

from routers import sel


def test_percentile_basic():
    values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    assert sel._percentile(values, 90) == 9
    assert sel._percentile(values, 50) in (5, 6)
    assert sel._percentile([], 90) == 0.0


def test_risk_seviyesi_thresholds():
    assert sel.risk_seviyesi(1.6) == "KRITIK"
    assert sel.risk_seviyesi(1.3) == "YUKSEK"
    assert sel.risk_seviyesi(1.05) == "ORTA"
    assert sel.risk_seviyesi(0.5) == "NORMAL"


class _FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload or {}

    def json(self):
        return self._payload


class _FakeAsyncClient:
    def __init__(self, discharge_by_lat=None):
        self._discharge_by_lat = discharge_by_lat or {}

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def get(self, url, params=None, timeout=None):
        lat = params["latitude"]
        discharges = self._discharge_by_lat.get(lat, [10.0] * 92)
        return _FakeResponse(200, {"daily": {"river_discharge": discharges}})


def test_fetch_all_points_runs_in_parallel_and_normalizes(monkeypatch):
    fake_client = _FakeAsyncClient()
    monkeypatch.setattr(sel.httpx, "AsyncClient", lambda: fake_client)

    results = asyncio.run(sel._fetch_all_points(percentile=90))

    assert len(results) == len(sel.NEHIR_NOKTALARI)
    for r in results:
        assert "nokta" in r
        assert "risk_seviyesi" in r or "hata" in r


def test_fetch_point_handles_missing_discharge_gracefully():
    async def run():
        async with _FakeAsyncClient(discharge_by_lat={36.99: []}) as client:
            return await sel._fetch_point(client, "Seyhan (Adana)", 36.99, 35.33, 90)

    result = asyncio.run(run())
    assert result["hata"] == "Debi verisi yok"


def test_fetch_point_handles_http_error_status():
    class ErrClient(_FakeAsyncClient):
        async def get(self, url, params=None, timeout=None):
            return _FakeResponse(500, {})

    async def run():
        async with ErrClient() as client:
            return await sel._fetch_point(client, "Test", 0, 0, 90)

    result = asyncio.run(run())
    assert result["hata"] == "Veri alınamadı"
