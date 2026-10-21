import json
import pytest
import httpx
from fastapi.testclient import TestClient
from routers import hosts
from main import app

client = TestClient(app)


@pytest.fixture
def cfg(tmp_path, monkeypatch):
    path = tmp_path / "config.json"
    monkeypatch.setattr(hosts, "CONFIG_PATH", path)
    return path


def _h():
    tok = client.post("/api/auth/login", json={"password": "pcmanager"}).json()["token"]
    return {"Authorization": f"Bearer {tok}"}


def test_token_never_returned(cfg):
    h = _h()
    res = client.post("/api/hosts", headers=h, json={"name": "nas", "url": "http://10.0.0.2:8081/", "token": "gizli"})
    assert res.status_code == 200
    body = res.json()
    assert "token" not in body and body["has_token"] and body["url"] == "http://10.0.0.2:8081"
    assert "gizli" not in client.get("/api/hosts", headers=h).text
    # token alanı gönderilmezse eskisi korunur
    client.put(f"/api/hosts/{body['id']}", headers=h, json={"name": "nas2", "url": "http://10.0.0.2:8081"})
    assert json.loads(cfg.read_text())["remote_hosts"][0]["token"] == "gizli"


@pytest.mark.parametrize("body", [
    {"name": ""}, {"name": "x"}, {"name": "x", "url": "ftp://a"},
    {"name": "x", "ssh": "-oProxyCommand=id"}, {"name": "x", "ssh": "a@b", "ssh_port": 70000},
])
def test_validation(body):
    with pytest.raises(ValueError):
        hosts.validate_host(body)


def test_probe_variants():
    def handler(request):
        if request.headers.get("authorization") != "Bearer ok":
            return httpx.Response(401)
        return httpx.Response(200, json={"hostname": "nas", "cpu": {"percent": 12}, "memory": {"percent": 40},
                                         "disk": {"percent": 70}, "uptime": 1, "os": "Linux"})
    import asyncio

    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as c:
            good = await hosts._probe(c, {"id": "a", "url": "http://x", "token": "ok"})
            bad = await hosts._probe(c, {"id": "b", "url": "http://x", "token": "no"})
            none = await hosts._probe(c, {"id": "c", "url": "", "token": "", "ssh": "u@h"})
            return good, bad, none
    good, bad, none = asyncio.run(go())
    assert good["online"] and good["cpu"] == 12 and good["hostname"] == "nas"
    assert bad["online"] and "Token" in bad["error"]
    assert none["online"] is None
