import json

from routers import hava_uyari


def test_il_from_town_id_maps_plaka_kodu_to_il():
    assert hava_uyari._il_from_town_id(90101) == "Adana"
    assert hava_uyari._il_from_town_id(91401) == "Bolu"
    assert hava_uyari._il_from_town_id("90601") == "Ankara"
    assert hava_uyari._il_from_town_id("not-a-number") is None
    assert hava_uyari._il_from_town_id(999999) is None


def test_parse_mgm_response_normalizes_valid_json():
    raw = json.dumps({
        "yellow": [
            {
                "_id": "abc123",
                "text": "Gök Gürültülü Sağanak Yağış",
                "weather": "Sağanak",
                "towns": [90101, 90601],
                "alertNo": 1,
                "begin": "2026-08-28T06:00:00",
                "end": "2026-08-29T06:00:00",
            }
        ],
        "orange": [],
        "red": [],
    })
    warnings = hava_uyari._parse_mgm_response(raw)
    assert len(warnings) == 2
    ils = {w["il"] for w in warnings}
    assert ils == {"Adana", "Ankara"}
    assert all(w["seviye"] == "DIKKAT" for w in warnings)
    assert all(w["kaynak"] == "MGM" for w in warnings)


def test_parse_mgm_response_raises_on_bozuk_json():
    try:
        hava_uyari._parse_mgm_response("{not valid json")
        assert False, "MgmParseError bekleniyordu"
    except hava_uyari.MgmParseError:
        pass


def test_parse_mgm_response_raises_when_schema_unrecognized():
    try:
        hava_uyari._parse_mgm_response(json.dumps({"foo": "bar"}))
        assert False, "MgmParseError bekleniyordu"
    except hava_uyari.MgmParseError:
        pass


def test_get_weather_warnings_falls_back_to_open_meteo_when_mgm_fails(monkeypatch):
    def boom(url):
        raise hava_uyari.MgmParseError("MGM şeması değişti")

    monkeypatch.setattr(hava_uyari, "_fetch_mgm_raw", boom)

    fallback_called = []

    def fake_fallback():
        fallback_called.append(True)
        return [{"il": "Ankara", "seviye": "DIKKAT", "tur": "Fırtına", "baslangic": None, "bitis": None, "kaynak": "Open-Meteo (tahmini, MGM yedek)"}]

    monkeypatch.setattr(hava_uyari, "_derive_warnings_from_open_meteo", fake_fallback)

    result = hava_uyari.get_weather_warnings()
    assert fallback_called == [True]
    assert result[0]["kaynak"].startswith("Open-Meteo")


def test_get_weather_warnings_uses_mgm_when_available(monkeypatch):
    today_raw = json.dumps({
        "yellow": [],
        "orange": [{"text": "Fırtına", "towns": [90901]}],
        "red": [],
    })

    def fake_fetch(url):
        if url == hava_uyari.MGM_TOMORROW_URL:
            return json.dumps({"yellow": [], "orange": [], "red": []})
        return today_raw

    monkeypatch.setattr(hava_uyari, "_fetch_mgm_raw", fake_fetch)

    fallback_called = []
    monkeypatch.setattr(hava_uyari, "_derive_warnings_from_open_meteo", lambda: fallback_called.append(True))

    result = hava_uyari.get_weather_warnings()
    assert fallback_called == []
    assert result[0]["il"] == "Aydın"
    assert result[0]["seviye"] == "YUKSEK"


def test_get_weather_warnings_merges_tomorrow_when_available(monkeypatch):
    def fake_fetch(url):
        if url == hava_uyari.MGM_TOMORROW_URL:
            return json.dumps({"yellow": [{"text": "Don", "towns": [90601]}], "orange": [], "red": []})
        return json.dumps({"yellow": [], "orange": [], "red": []})

    monkeypatch.setattr(hava_uyari, "_fetch_mgm_raw", fake_fetch)

    result = hava_uyari.get_weather_warnings()
    assert len(result) == 1
    assert result[0]["il"] == "Ankara"
    assert result[0]["zaman"] == "yarın"


def test_get_weather_warnings_ignores_tomorrow_failure(monkeypatch):
    def fake_fetch(url):
        if url == hava_uyari.MGM_TOMORROW_URL:
            raise RuntimeError("ağ hatası")
        return json.dumps({"yellow": [{"text": "Don", "towns": [90601]}], "orange": [], "red": []})

    monkeypatch.setattr(hava_uyari, "_fetch_mgm_raw", fake_fetch)

    result = hava_uyari.get_weather_warnings()
    assert len(result) == 1
    assert result[0]["zaman"] == "bugün"


def test_check_and_alert_filters_by_configured_province(monkeypatch):
    monkeypatch.setattr(hava_uyari, "_load_config", lambda: {"notifications": {"weather_province": "Ankara"}})
    monkeypatch.setattr(hava_uyari, "get_weather_warnings", lambda: [
        {"il": "Ankara", "seviye": "KRITIK", "tur": "Fırtına", "kaynak": "MGM"},
        {"il": "İzmir", "seviye": "KRITIK", "tur": "Fırtına", "kaynak": "MGM"},
    ])
    hava_uyari._seen_alerts.clear()
    sent = []
    monkeypatch.setattr(hava_uyari, "send_telegram_sync", lambda msg: sent.append(msg) or True)

    hava_uyari._check_and_alert()

    assert len(sent) == 1
    assert "Ankara" in sent[0]
