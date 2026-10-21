import pytest
import pyotp
from pathlib import Path
from fastapi.testclient import TestClient
import auth as auth_module
from routers import auth as auth_router
from main import app

client = TestClient(app)
BACKEND = Path(__file__).parent.parent
STATE_FILES = [BACKEND / "config.json", auth_module.SESSIONS_PATH]


@pytest.fixture(autouse=True)
def isolated_state():
    saved = {p: (p.read_text() if p.exists() else None) for p in STATE_FILES}
    for p in STATE_FILES:
        p.unlink(missing_ok=True)
    auth_router._failures.clear()
    yield
    for p, content in saved.items():
        if content is None:
            p.unlink(missing_ok=True)
        else:
            p.write_text(content)
    auth_router._failures.clear()


def _login(password="pcmanager", username=None, totp=None):
    body = {"password": password}
    if username:
        body["username"] = username
    if totp:
        body["totp"] = totp
    return client.post("/api/auth/login", json=body)


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def _admin():
    res = _login()
    assert res.status_code == 200, res.text
    return res.json()["token"]


def test_legacy_login_without_username():
    res = _login()
    assert res.status_code == 200
    assert res.json()["username"] == "admin"
    assert res.json()["role"] == "admin"


def test_logout_revokes_token():
    token = _admin()
    assert client.get("/api/auth/me", headers=_h(token)).status_code == 200
    assert client.post("/api/auth/logout", headers=_h(token)).status_code == 200
    assert client.get("/api/auth/me", headers=_h(token)).status_code == 401


def test_token_without_session_rejected():
    forged = auth_module.create_access_token({"sub": "admin"})
    assert client.get("/api/system/stats", headers=_h(forged)).status_code == 401


def test_revoke_other_sessions():
    a, b = _admin(), _admin()
    res = client.post("/api/auth/sessions/revoke-others", headers=_h(a))
    assert res.json()["revoked"] == 1
    assert client.get("/api/auth/me", headers=_h(a)).status_code == 200
    assert client.get("/api/auth/me", headers=_h(b)).status_code == 401


def test_session_listing_marks_current():
    token = _admin()
    items = client.get("/api/auth/sessions", headers=_h(token)).json()
    assert len(items) == 1 and items[0]["current"]


def test_viewer_role_is_read_only():
    admin = _admin()
    res = client.post("/api/users", headers=_h(admin),
                      json={"username": "izleyici", "password": "secret1", "role": "viewer"})
    assert res.status_code == 200, res.text
    viewer = _login("secret1", "izleyici").json()["token"]

    assert client.get("/api/system/stats", headers=_h(viewer)).status_code == 200
    # yazma işlemleri ve hassas okumalar yasak
    assert client.post("/api/power/reboot", headers=_h(viewer)).status_code == 403
    assert client.get("/api/files/list?path=/", headers=_h(viewer)).status_code == 403
    assert client.get("/api/settings", headers=_h(viewer)).status_code == 403
    assert client.get("/api/users", headers=_h(viewer)).status_code == 403
    # kendi hesabı üzerinde işlem yapabilir
    assert client.get("/api/auth/sessions", headers=_h(viewer)).status_code == 200


def test_viewer_cannot_open_terminal():
    admin = _admin()
    client.post("/api/users", headers=_h(admin),
                json={"username": "izleyici", "password": "secret1", "role": "viewer"})
    viewer = _login("secret1", "izleyici").json()["token"]
    from starlette.websockets import WebSocketDisconnect
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/api/terminal?token={viewer}") as ws:
            ws.receive_text()


def test_settings_never_expose_password_hashes():
    admin = _admin()
    client.post("/api/users", headers=_h(admin),
                json={"username": "ikinci", "password": "secret1", "role": "admin"})
    cfg = client.get("/api/settings", headers=_h(admin)).json()
    assert "users" not in cfg and "_password_hash" not in cfg
    # ayarlar üzerinden kullanıcı listesi ezilemez
    client.put("/api/settings", headers=_h(admin), json={"users": []})
    assert _login("secret1", "ikinci").status_code == 200


def test_cannot_delete_last_admin():
    admin = _admin()
    client.post("/api/users", headers=_h(admin),
                json={"username": "ikinci", "password": "secret1", "role": "viewer"})
    res = client.put("/api/users/admin", headers=_h(admin), json={"role": "viewer"})
    assert res.status_code == 400


def test_deleting_user_revokes_sessions():
    admin = _admin()
    client.post("/api/users", headers=_h(admin),
                json={"username": "gecici", "password": "secret1", "role": "viewer"})
    tok = _login("secret1", "gecici").json()["token"]
    assert client.delete("/api/users/gecici", headers=_h(admin)).status_code == 200
    assert client.get("/api/auth/me", headers=_h(tok)).status_code == 401


def test_role_change_applies_to_existing_sessions():
    admin = _admin()
    client.post("/api/users", headers=_h(admin),
                json={"username": "terfi", "password": "secret1", "role": "viewer"})
    tok = _login("secret1", "terfi").json()["token"]
    assert client.get("/api/settings", headers=_h(tok)).status_code == 403
    client.put("/api/users/terfi", headers=_h(admin), json={"role": "admin"})
    assert client.get("/api/settings", headers=_h(tok)).status_code == 200


def test_password_change_keeps_current_session_only():
    a, b = _admin(), _admin()
    res = client.post("/api/auth/password", headers=_h(a), json={"current": "pcmanager", "new": "yenisifre"})
    assert res.status_code == 200, res.text
    assert client.get("/api/auth/me", headers=_h(b)).status_code == 401
    assert _login("pcmanager").status_code == 401
    assert _login("yenisifre").status_code == 200


def test_totp_flow():
    token = _admin()
    setup = client.post("/api/auth/2fa/setup", headers=_h(token)).json()
    totp = pyotp.TOTP(setup["secret"])
    assert client.post("/api/auth/2fa/enable", headers=_h(token), json={"code": "000000"}).status_code == 400
    assert client.post("/api/auth/2fa/enable", headers=_h(token), json={"code": totp.now()}).status_code == 200

    res = _login()
    assert res.status_code == 401 and "totp_required" in res.text
    assert "totp_invalid" in _login(totp="123456").text
    assert _login(totp=totp.now()).status_code == 200

    assert client.post("/api/auth/2fa/disable", headers=_h(token), json={"password": "pcmanager"}).status_code == 200
    assert _login().status_code == 200


def test_login_rate_limit():
    for _ in range(auth_router.MAX_FAILURES):
        assert _login("yanlis").status_code == 401
    assert _login("yanlis").status_code == 429
    # doğru şifre de kilit süresince reddedilir
    assert _login().status_code == 429


def test_api_token_long_lived_and_listed():
    admin = _admin()
    res = client.post("/api/auth/tokens", headers=_h(admin), json={"name": "prometheus", "days": 30, "role": "viewer"})
    assert res.status_code == 200
    api_tok = res.json()["token"]
    assert client.get("/api/system/stats", headers=_h(api_tok)).status_code == 200
    assert client.post("/api/power/reboot", headers=_h(api_tok)).status_code == 403
    kinds = {s["kind"] for s in client.get("/api/auth/sessions", headers=_h(admin)).json()}
    assert kinds == {"web", "api"}


def test_viewer_cannot_mint_admin_token():
    admin = _admin()
    client.post("/api/users", headers=_h(admin),
                json={"username": "izleyici", "password": "secret1", "role": "viewer"})
    viewer = _login("secret1", "izleyici").json()["token"]
    res = client.post("/api/auth/tokens", headers=_h(viewer), json={"name": "x", "role": "admin"})
    assert res.status_code == 400


def test_viewer_cannot_rerun_setup():
    admin = _admin()
    client.post("/api/setup", headers=_h(admin), json={"password": "pcmanager"})
    client.post("/api/users", headers=_h(admin),
                json={"username": "izleyici", "password": "secret1", "role": "viewer"})
    viewer = _login("secret1", "izleyici").json()["token"]
    res = client.post("/api/setup", headers=_h(viewer), json={"password": "ele-gecirdim"})
    assert res.status_code == 403
