from routers import hava_uyari


def test_parse_mgm_response_normalizes_valid_xml():
    xml = """<items>
        <item><il>Muğla</il><seviye>kırmızı</seviye><tur>Sıcak Hava</tur></item>
        <item><il>Ankara</il><seviye>sarı</seviye><tur>Don</tur></item>
    </items>"""
    warnings = hava_uyari._parse_mgm_response(xml)
    assert len(warnings) == 2
    assert warnings[0]["il"] == "Muğla"
    assert warnings[0]["seviye"] == "KRITIK"
    assert warnings[1]["seviye"] == "DIKKAT"


def test_parse_mgm_response_raises_on_bozuk_xml():
    try:
        hava_uyari._parse_mgm_response("<not valid xml")
        assert False, "MgmParseError bekleniyordu"
    except hava_uyari.MgmParseError:
        pass


def test_parse_mgm_response_raises_when_schema_unrecognized():
    xml = "<root><foo>bar</foo></root>"
    try:
        hava_uyari._parse_mgm_response(xml)
        assert False, "MgmParseError bekleniyordu"
    except hava_uyari.MgmParseError:
        pass


def test_get_weather_warnings_falls_back_to_open_meteo_when_mgm_fails(monkeypatch):
    def boom():
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
    monkeypatch.setattr(hava_uyari, "_fetch_mgm_raw", lambda: "<items><item><il>İzmir</il><seviye>turuncu</seviye><tur>Fırtına</tur></item></items>")

    fallback_called = []
    monkeypatch.setattr(hava_uyari, "_derive_warnings_from_open_meteo", lambda: fallback_called.append(True))

    result = hava_uyari.get_weather_warnings()
    assert fallback_called == []
    assert result[0]["il"] == "İzmir"
    assert result[0]["seviye"] == "YUKSEK"


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
