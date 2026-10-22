"""Oturum ömrü, WebSocket yetki kodları, kurulum kapısı, oran sınırı ve log maskeleme."""
import logging
import os
import stat
import time

import pytest
from fastapi.testclient import TestClient
from jose import jwt
from starlette.requests import Request
from starlette.websockets import WebSocketDisconnect

import auth
import log_redact
from routers import auth as auth_router
from main import app

client = TestClient(app, raise_server_exceptions=False)
STATE = [auth.CONFIG_PATH, auth.SESSIONS_PATH]


@pytest.fixture(autouse=True)
def isolated_state(monkeypatch):
    # POST /api/setup süreç ortamına PCMANAGER_PASSWORD_HASH yazar; testler arasında sızmasın
    monkeypatch.setenv("PCMANAGER_PASSWORD_HASH", "x")
    monkeypatch.delenv("PCMANAGER_PASSWORD_HASH")
    saved = {p: (p.read_text() if p.exists() else None) for p in STATE}
    for p in STATE:
        p.unlink(missing_ok=True)
    auth_router._failures.clear()
    yield
    for p, content in saved.items():
        if content is None:
            p.unlink(missing_ok=True)
        else:
            p.write_text(content)
    auth_router._failures.clear()


def _login(password="pcmanager", username=None):
    body = {"password": password}
    if username:
        body["username"] = username
    return client.post("/api/auth/login", json=body)


def _admin():
    return _login().json()["token"]


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def _edit_session(jti, **fields):
    sessions = dict(auth._load_sessions())
    sessions[jti] = {**sessions[jti], **fields}
    auth._save_sessions(sessions)


# ─── Kayan oturum ────────────────────────────────────────────────────────────

def test_web_session_slides_with_use():
    token, jti = auth.create_session("admin", "admin", expire_minutes=10)
    now = time.time()
    _edit_session(jti, last_seen=int(now) - 120, expires=int(now) + 60)  # süresi dolmak üzere
    assert client.get("/api/auth/me", headers=_h(token)).status_code == 200
    expires = auth.get_session(jti)["expires"]
    assert now + 590 <= expires <= now + 620  # boşta kalma süresi (10 dk) kadar uzadı


def test_sliding_never_passes_absolute_limit():
    token, jti = auth.create_session("admin", "admin", expire_minutes=600)
    now = time.time()
    _edit_session(jti, last_seen=int(now) - 120, absolute=int(now) + 100)
    client.get("/api/auth/me", headers=_h(token))
    assert auth.get_session(jti)["expires"] <= int(now) + 101


def test_expired_session_rejected_and_jwt_lives_for_max_days():
    token, jti = auth.create_session("admin", "admin")
    exp = jwt.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])["exp"]
    assert abs(exp - (time.time() + auth.SESSION_MAX_DAYS * 86400)) < 60
    _edit_session(jti, expires=int(time.time()) - 1)
    res = client.get("/api/auth/me", headers=_h(token))
    assert res.status_code == 401


def test_api_tokens_do_not_slide():
    token, jti = auth.create_session("admin", "admin", kind="api", name="x", expire_minutes=60)
    before = auth.get_session(jti)["expires"]
    _edit_session(jti, last_seen=int(time.time()) - 600)
    client.get("/api/auth/me", headers=_h(token))
    assert auth.get_session(jti)["expires"] == before


def test_web_sessions_per_user_are_capped_evicting_least_recent():
    first, first_jti = auth.create_session("admin", "admin")
    _edit_session(first_jti, last_seen=1)  # en eski/az kullanılan
    for _ in range(auth.MAX_WEB_SESSIONS_PER_USER + 3):
        auth.create_session("admin", "admin")
    mine = [s for s in auth.list_sessions("admin") if s["kind"] == "web"]
    assert len(mine) == auth.MAX_WEB_SESSIONS_PER_USER
    assert client.get("/api/auth/me", headers=_h(first)).status_code == 401


# ─── JWT secret dosyası ──────────────────────────────────────────────────────

def test_secret_file_is_private_and_stable(tmp_path, monkeypatch):
    path = tmp_path / ".jwt_secret"
    monkeypatch.setattr(auth, "JWT_SECRET_PATH", path)
    monkeypatch.delenv("PCMANAGER_SECRET", raising=False)
    key = auth._get_secret_key()
    assert len(key) == 64 and stat.S_IMODE(path.stat().st_mode) == 0o600
    assert auth._get_secret_key() == key  # yeniden başlatmada aynı anahtar


def test_secret_file_empty_is_regenerated_and_loose_perms_fixed(tmp_path, monkeypatch):
    path = tmp_path / ".jwt_secret"
    monkeypatch.setattr(auth, "JWT_SECRET_PATH", path)
    monkeypatch.delenv("PCMANAGER_SECRET", raising=False)
    path.write_text("")
    key = auth._get_secret_key()
    assert key and path.read_text().strip() == key
    path.write_text("abc123")
    os.chmod(path, 0o644)
    assert auth._get_secret_key() == "abc123"
    assert stat.S_IMODE(path.stat().st_mode) == 0o600


# ─── Kurulum kapısı ──────────────────────────────────────────────────────────

def test_login_closed_until_setup_completed(monkeypatch):
    monkeypatch.delenv("PCMANAGER_ALLOW_DEFAULT_PASSWORD", raising=False)
    monkeypatch.delenv("PCMANAGER_PASSWORD", raising=False)
    monkeypatch.delenv("PCMANAGER_PASSWORD_HASH", raising=False)
    res = _login("pcmanager")
    assert res.status_code == 403 and "setup_required" in res.text
    assert not auth.list_sessions()  # hiç oturum açılmadı
    # sihirbaz tamamlanınca giriş açılır; varsayılan şifre artık geçerli değil
    assert client.post("/api/setup", json={"password": "yeni-sifre-1", "site_name": "X"}).status_code == 200
    assert _login("pcmanager").status_code == 401
    assert _login("yeni-sifre-1").status_code == 200


def test_env_password_counts_as_configured(monkeypatch):
    monkeypatch.delenv("PCMANAGER_ALLOW_DEFAULT_PASSWORD", raising=False)
    monkeypatch.setenv("PCMANAGER_PASSWORD", "ortam-sifresi")
    assert auth.is_configured()
    assert _login("ortam-sifresi").status_code == 200


# ─── Oran sınırı ─────────────────────────────────────────────────────────────

def test_rate_limit_is_per_user_not_global():
    for _ in range(auth_router.MAX_FAILURES):
        assert _login("yanlis", "kurban").status_code == 401
    assert _login("yanlis", "kurban").status_code == 429
    # aynı IP'den başka bir kullanıcı kilitlenmez
    assert _login("pcmanager").status_code == 200


def test_rate_limit_ip_bucket_stops_username_spraying():
    for i in range(auth_router.MAX_FAILURES_PER_IP):
        assert _login("yanlis", f"kullanici{i}").status_code == 401
    assert _login("pcmanager").status_code == 429


def test_rate_limit_expired_entries_are_dropped():
    ip_key, user_key = auth_router._keys("1.2.3.4", "x")
    old = time.time() - auth_router.FAILURE_WINDOW - 5
    auth_router._failures[user_key].extend([old] * 50)
    auth_router._check_rate_limit("1.2.3.4", "x")  # kilitlemez, eski kayıtları siler
    assert user_key not in auth_router._failures


def _request(peer, headers=None):
    scope = {"type": "http", "client": (peer, 5000), "headers": [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]}
    return Request(scope)


def test_forwarded_for_is_trusted_only_from_loopback_proxy():
    assert auth_router._client_ip(_request("127.0.0.1", {"X-Forwarded-For": "6.6.6.6, 100.64.0.9"})) == "100.64.0.9"
    # dışarıdan gelen istek başlığı uydurup limiti atlatamaz
    assert auth_router._client_ip(_request("100.64.0.5", {"X-Forwarded-For": "6.6.6.6"})) == "100.64.0.5"
    assert auth_router._client_ip(_request("127.0.0.1")) == "127.0.0.1"


# ─── WebSocket yetki kodları ─────────────────────────────────────────────────

def _close_of(path):
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect(path) as ws:
            ws.receive_text()
    return exc.value


def test_ws_invalid_or_missing_token_closes_with_4401():
    assert _close_of("/api/system/ws?token=sahte").code == 4401
    assert _close_of("/api/system/ws").code == 4401
    assert _close_of("/api/terminal?token=sahte").code == 4401
    assert _close_of("/api/playbooks/runs/x/ws").code == 4401


def test_ws_revoked_session_closes_with_4401():
    token = _admin()
    client.post("/api/auth/logout", headers=_h(token))
    assert _close_of(f"/api/system/ws?token={token}").code == 4401


def test_ws_viewer_on_admin_endpoint_closes_with_4403_but_can_watch_stats():
    admin = _admin()
    client.post("/api/users", headers=_h(admin), json={"username": "izleyici", "password": "secret1", "role": "viewer"})
    viewer = _login("secret1", "izleyici").json()["token"]
    err = _close_of(f"/api/terminal?token={viewer}")
    assert err.code == 4403 and err.reason
    with client.websocket_connect(f"/api/system/ws?token={viewer}") as ws:
        assert "cpu" in ws.receive_json()


# ─── Log maskeleme ───────────────────────────────────────────────────────────

def test_tokens_are_scrubbed_from_log_records(caplog):
    log_redact.install()
    caplog.set_level(logging.INFO)
    logging.getLogger("uvicorn.error").info('%s - "WebSocket %s" 403', "1.2.3.4:5", "/api/system/ws?token=eyJabc.def.ghi&tail=300")
    logging.getLogger("uvicorn.access").info('%s - "GET %s HTTP/1.1" 200', "1.2.3.4:5", "/api/proxy/page?url=x&token=eyJabc.def.ghi")
    text = caplog.text
    assert "eyJabc" not in text and "def.ghi" not in text
    assert "token=***&tail=300" in text and "&token=***" in text
