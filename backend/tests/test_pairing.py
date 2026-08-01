import pytest
import json
import os
import time
from pathlib import Path
from fastapi.testclient import TestClient
from jose import jwt
import auth as auth_module
from main import app

client = TestClient(app)
CONFIG_PATH = Path(__file__).parent.parent / "config.json"


@pytest.fixture(autouse=True)
def backup_config():
    # Back up config.json if it exists
    exists = CONFIG_PATH.exists()
    content = None
    if exists:
        content = CONFIG_PATH.read_text()
    
    yield
    
    # Restore config.json
    if exists:
        CONFIG_PATH.write_text(content)
    elif CONFIG_PATH.exists():
        try:
            os.remove(CONFIG_PATH)
        except Exception:
            pass


def _get_token():
    res = client.post("/api/auth/login", json={"password": "pcmanager"})
    assert res.status_code == 200
    return res.json()["token"]


def _auth_headers():
    return {"Authorization": f"Bearer {_get_token()}"}


def test_get_pairing_qr_requires_admin_auth():
    res = client.get("/api/pairing/qr")
    assert res.status_code == 401


def test_get_pairing_qr():
    res = client.get("/api/pairing/qr", headers=_auth_headers())
    assert res.status_code == 200
    data = res.json()
    assert "local_ips" in data
    assert "port" in data
    assert "pairing_token" in data
    assert len(data["pairing_token"]) == 6


def test_pairing_flow():
    # 1. Get pairing code (admin must already be logged in)
    res = client.get("/api/pairing/qr", headers=_auth_headers())
    assert res.status_code == 200
    token = res.json()["pairing_token"]
    
    # 2. Try pairing with invalid token
    res = client.post("/api/pairing/pair", json={"token": "wrong", "device_id": "test_device"})
    assert res.status_code == 401
    
    # 3. Pair with valid token
    res = client.post("/api/pairing/pair", json={"token": token, "device_id": "test_device", "device_name": "Test iPhone"})
    assert res.status_code == 200
    pair_data = res.json()
    assert pair_data["success"] is True
    assert "token" in pair_data
    mobile_token = pair_data["token"]

    # 3b. Mobile token should be long-lived (~10 years), not the 8h admin default
    payload = jwt.decode(mobile_token, auth_module.SECRET_KEY, algorithms=[auth_module.ALGORITHM])
    assert payload["exp"] - time.time() > 60 * 60 * 24 * 365 * 5  # more than 5 years left

    # 4. Access authorized route using mobile token
    res = client.get("/api/system/stats", headers={"Authorization": f"Bearer {mobile_token}"})
    assert res.status_code == 200
    
    # 5. List paired devices (requires admin auth)
    res = client.get("/api/pairing/devices", headers=_auth_headers())
    assert res.status_code == 200
    devices = res.json()
    assert any(d["device_id"] == "test_device" for d in devices)
    
    # 6. Revoke device
    res = client.delete("/api/pairing/devices/test_device", headers=_auth_headers())
    assert res.status_code == 200
    
    # 7. Try accessing again using revoked mobile token (should fail)
    res = client.get("/api/system/stats", headers={"Authorization": f"Bearer {mobile_token}"})
    assert res.status_code == 401
