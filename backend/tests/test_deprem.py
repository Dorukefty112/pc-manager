from datetime import datetime, timezone

from routers import deprem


class _FakeAfadResponse:
    def raise_for_status(self):
        return None

    def json(self):
        return [
            {
                "eventDate": "2026-05-16T12:34:56",
                "latitude": "40.90",
                "longitude": "29.10",
                "depth": "7.2",
                "magnitude": "4.1",
                "location": "MARMARA DENIZI",
            }
        ]


def test_fetch_afad_accepts_raw_list_response(monkeypatch):
    """AFAD sometimes returns a raw list instead of a {'data': [...]} wrapper."""

    def fake_get(url, params=None, timeout=None):
        assert url == deprem.AFAD_URL
        return _FakeAfadResponse()

    monkeypatch.setattr(deprem.httpx, "get", fake_get)

    result = deprem.fetch_afad()

    assert len(result) == 1
    event = result[0]
    assert event.tarih == "2026.05.16"
    assert event.saat == "12:34:56"
    assert event.enlem == 40.90
    assert event.boylam == 29.10
    assert event.derinlik == 7.2
    assert event.magnitude == 4.1
    assert event.yer == "MARMARA DENIZI"
    assert event.cozum == "AFAD"


def test_son_depremler_uses_afad_raw_list_when_kandilli_empty(monkeypatch):
    """Public endpoint fallback should survive AFAD's raw-list shape."""

    def fake_fetch_kandilli():
        return []

    monkeypatch.setattr(deprem, "fetch_kandilli", fake_fetch_kandilli)

    now = datetime.now(timezone.utc)
    event = deprem.Deprem(
        now.strftime("%Y.%m.%d"),
        now.strftime("%H:%M:%S"),
        40.90,
        29.10,
        7.2,
        -1.0,
        4.1,
        -1.0,
        "MARMARA DENIZI",
        "AFAD",
        is_utc=True,
    )
    monkeypatch.setattr(deprem, "fetch_afad", lambda: [event])

    data = deprem.son_depremler()

    assert len(data) == 1
    assert data[0]["yer"] == "MARMARA DENIZI"
    assert data[0]["magnitude"] == 4.1
