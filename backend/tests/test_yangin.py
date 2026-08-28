from routers import yangin


def test_parse_firms_csv_empty_response_returns_empty_list():
    assert yangin._parse_firms_csv("") == []
    assert yangin._parse_firms_csv("   \n  ") == []


def test_parse_firms_csv_normalizes_valid_row():
    csv_text = (
        "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,"
        "instrument,confidence,version,bright_t31,frp,daynight\n"
        "38.5,35.2,330.5,0.4,0.4,2026-08-01,1230,N,VIIRS,h,2.0NRT,290.1,75.3,D\n"
    )
    records = yangin._parse_firms_csv(csv_text)
    assert len(records) == 1
    r = records[0]
    assert r["enlem"] == 38.5
    assert r["boylam"] == 35.2
    assert r["frp"] == 75.3
    assert r["confidence_score"] == 90.0
    assert r["risk_seviyesi"] == "KRITIK"
    assert r["il"] is not None


def test_parse_firms_csv_skips_malformed_rows_without_crashing():
    csv_text = "latitude,longitude,frp,confidence\nnot-a-number,35.2,10,h\n"
    assert yangin._parse_firms_csv(csv_text) == []


def test_confidence_score_handles_letter_and_numeric():
    assert yangin._confidence_score("h") == 90.0
    assert yangin._confidence_score("nominal") == 60.0
    assert yangin._confidence_score("l") == 20.0
    assert yangin._confidence_score("42") == 42.0
    assert yangin._confidence_score(None) == 0.0
    assert yangin._confidence_score("garbage") == 0.0


def test_risk_seviyesi_thresholds():
    assert yangin.risk_seviyesi(frp=60, confidence_score=90) == "KRITIK"
    assert yangin.risk_seviyesi(frp=10, confidence_score=90) == "YUKSEK"
    assert yangin.risk_seviyesi(frp=10, confidence_score=60) == "ORTA"
    assert yangin.risk_seviyesi(frp=1, confidence_score=10) == "DIKKAT"


def test_fetch_fires_without_api_key_returns_empty(monkeypatch):
    monkeypatch.setattr(yangin, "_get_api_key", lambda: "")
    assert yangin._fetch_fires() == []


def test_check_and_alert_sends_telegram_for_new_high_risk_fire(monkeypatch):
    fake_fire = {
        "id": "fire-1", "il": "Muğla", "il_uzaklik_km": 5.0,
        "frp": 100, "risk_seviyesi": "KRITIK", "satellite": "N",
    }
    monkeypatch.setattr(yangin, "_fetch_fires", lambda gun_araligi=1: [fake_fire])
    monkeypatch.setattr(yangin, "_load_config", lambda: {})
    yangin._seen_fires.clear()

    sent = []
    monkeypatch.setattr(yangin, "send_telegram_sync", lambda msg: sent.append(msg) or True)

    yangin._check_and_alert()
    assert len(sent) == 1
    assert "Muğla" in sent[0]

    # Aynı yangın ikinci taramada tekrar bildirim göndermemeli (dedupe)
    yangin._check_and_alert()
    assert len(sent) == 1
