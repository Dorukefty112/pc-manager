import json

from routers import hava_uyari

# Gemini Antigravity ile canlı MGM uç noktasından doğrulanmış gerçek yanıt
# (2026-08-28, servis.mgm.gov.tr/web/meteoalarm/today) - kısaltılmış tek kayıt.
REAL_MGM_SAMPLE = json.dumps([
    {
        "_id": "6a914b858dde2f0c588bf649",
        "text": {"yellow": "Sağanak ve gök gürültülü sağanak yağışların kuvvetli olması bekleniyor."},
        "weather": {"yellow": ["thunderstorm"], "orange": [], "red": []},
        "towns": {"yellow": [90501, 91901, 95201], "orange": [], "red": []},
        "alertNo": 2026082803,
        "begin": "2026-08-28T20:00:00.000Z",
        "end": "2026-08-30T17:00:00.000Z",
    },
    {
        "_id": "6a914f098dde2f0c588bf64b",
        "text": {"orange": "Sağanak ve gök gürültülü sağanak yağışların çok kuvvetli olması bekleniyor."},
        "weather": {"yellow": [], "orange": ["thunderstorm"], "red": []},
        "towns": {"yellow": [], "orange": [95203, 95502], "red": []},
        "alertNo": 2026082805,
        "begin": "2026-08-28T20:00:00.000Z",
        "end": "2026-08-29T19:59:00.000Z",
    },
])


def test_il_from_town_id_maps_plaka_kodu_to_il():
    # Canlı MGM verisiyle çapraz doğrulandı (data-iladi değerleri):
    assert hava_uyari._il_from_town_id(90101) == "Adana"
    assert hava_uyari._il_from_town_id(90501) == "Amasya"
    assert hava_uyari._il_from_town_id(91401) == "Bolu"
    assert hava_uyari._il_from_town_id(91901) == "Çorum"
    assert hava_uyari._il_from_town_id(95201) == "Ordu"
    assert hava_uyari._il_from_town_id(95501) == "Samsun"
    assert hava_uyari._il_from_town_id(96001) == "Tokat"
    assert hava_uyari._il_from_town_id(97801) == "Karabük"
    assert hava_uyari._il_from_town_id(98101) == "Düzce"
    assert hava_uyari._il_from_town_id("not-a-number") is None
    assert hava_uyari._il_from_town_id(999999) is None


def test_parse_mgm_response_normalizes_real_schema():
    warnings = hava_uyari._parse_mgm_response(REAL_MGM_SAMPLE)
    assert len(warnings) == 5  # 3 sarı (Amasya/Çorum/Ordu) + 2 turuncu (Ordu/Samsun)

    sari = [w for w in warnings if w["seviye"] == "DIKKAT"]
    turuncu = [w for w in warnings if w["seviye"] == "YUKSEK"]
    assert {w["il"] for w in sari} == {"Amasya", "Çorum", "Ordu"}
    assert {w["il"] for w in turuncu} == {"Ordu", "Samsun"}
    assert all(w["tur"] == "Gök Gürültülü Sağanak Yağış" for w in warnings)
    assert all(w["kaynak"] == "MGM" for w in warnings)
    assert all(w["zaman"] == "bugün" for w in warnings)


def test_parse_mgm_response_empty_list_is_not_an_error():
    assert hava_uyari._parse_mgm_response("[]") == []


def test_parse_mgm_response_raises_on_bozuk_json():
    try:
        hava_uyari._parse_mgm_response("{not valid json")
        assert False, "MgmParseError bekleniyordu"
    except hava_uyari.MgmParseError:
        pass


def test_parse_mgm_response_raises_when_root_is_not_list():
    try:
        hava_uyari._parse_mgm_response(json.dumps({"foo": "bar"}))
        assert False, "MgmParseError bekleniyordu"
    except hava_uyari.MgmParseError:
        pass


def test_parse_mgm_response_raises_when_schema_unrecognized():
    try:
        hava_uyari._parse_mgm_response(json.dumps([{"foo": "bar"}]))
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
    def fake_fetch(url):
        if url == hava_uyari.MGM_TOMORROW_URL:
            return "[]"
        return REAL_MGM_SAMPLE

    monkeypatch.setattr(hava_uyari, "_fetch_mgm_raw", fake_fetch)

    fallback_called = []
    monkeypatch.setattr(hava_uyari, "_derive_warnings_from_open_meteo", lambda: fallback_called.append(True))

    result = hava_uyari.get_weather_warnings()
    assert fallback_called == []
    assert len(result) == 5
    assert all(w["kaynak"] == "MGM" for w in result)


def test_get_weather_warnings_merges_tomorrow_when_available(monkeypatch):
    def fake_fetch(url):
        if url == hava_uyari.MGM_TOMORROW_URL:
            return json.dumps([{
                "towns": {"yellow": [90601], "orange": [], "red": []},
                "weather": {"yellow": ["wind"], "orange": [], "red": []},
                "begin": None, "end": None,
            }])
        return "[]"

    monkeypatch.setattr(hava_uyari, "_fetch_mgm_raw", fake_fetch)

    result = hava_uyari.get_weather_warnings()
    assert len(result) == 1
    assert result[0]["il"] == "Ankara"
    assert result[0]["zaman"] == "yarın"


def test_get_weather_warnings_ignores_tomorrow_failure(monkeypatch):
    def fake_fetch(url):
        if url == hava_uyari.MGM_TOMORROW_URL:
            raise RuntimeError("ağ hatası")
        return json.dumps([{
            "towns": {"yellow": [90601], "orange": [], "red": []},
            "weather": {"yellow": ["frost"], "orange": [], "red": []},
            "begin": None, "end": None,
        }])

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
