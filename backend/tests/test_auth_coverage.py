"""Tüm API endpoint'lerinin kimlik doğrulama gerektirdiğini doğrular.

Yeni bir router eklenip korumasız bırakılırsa bu test kırılır.
"""
import re
from pathlib import Path
from fastapi.testclient import TestClient
from main import app

client = TestClient(app, raise_server_exceptions=False)
CONFIG_PATH = Path(__file__).parent.parent / "config.json"

# Bilinçli olarak herkese açık olan yollar
PUBLIC_PREFIXES = (
    "/api/auth/login",
    "/api/version",
    "/api/setup",
    "/api/pairing/pair",
    "/api/deprem/",
    "/api/yangin/",
    "/api/sel/",
    "/api/hava/",
)


def _is_public(path: str) -> bool:
    return not path.startswith("/api/") or any(path.startswith(p) for p in PUBLIC_PREFIXES)


def test_every_private_endpoint_requires_auth():
    config_before = CONFIG_PATH.read_text() if CONFIG_PATH.exists() else None
    unprotected = []
    try:
        for path, ops in app.openapi()["paths"].items():
            if _is_public(path):
                continue
            concrete = re.sub(r"\{[^}]+\}", "x", path)
            for method in ops:
                if method == "get":
                    res = client.get(concrete)
                else:
                    res = client.request(method.upper(), concrete, json={})
                if res.status_code != 401:
                    unprotected.append(f"{method.upper()} {path} -> {res.status_code}")
    finally:
        if config_before is None:
            CONFIG_PATH.unlink(missing_ok=True)
        else:
            CONFIG_PATH.write_text(config_before)
    assert not unprotected, "Korumasız endpoint'ler:\n" + "\n".join(unprotected)


def test_playbook_run_requires_auth():
    res = client.post("/api/playbooks", json={"name": "x", "steps": [{"type": "command", "cmd": "id"}]})
    assert res.status_code == 401


def test_playbook_ws_rejects_missing_token():
    import pytest
    from starlette.websockets import WebSocketDisconnect
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/api/playbooks/runs/x/ws") as ws:
            ws.receive_json()


def test_proxy_requires_auth():
    res = client.get("/api/proxy/page?url=http://127.0.0.1:1")
    assert res.status_code == 401
    res = client.get("/api/proxy/page?url=http://127.0.0.1:1&token=bogus")
    assert res.status_code == 401


def test_spa_fallback_blocks_path_traversal():
    secret = Path(__file__).parent.parent / ".jwt_secret"
    assert secret.exists()
    for raw in ("/..%2F..%2Fbackend%2F.jwt_secret", "/..%2f..%2fbackend%2fconfig.json",
                "/%2e%2e/%2e%2e/backend/.jwt_secret", "/..%2F..%2F..%2F..%2F..%2Fetc%2Fpasswd"):
        res = client.get(raw)
        assert secret.read_text().strip() not in res.text, raw
        assert "root:" not in res.text, raw
        assert '"_password_hash"' not in res.text, raw
