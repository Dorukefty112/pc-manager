import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from routers import docker
from main import app

client = TestClient(app)


def _h():
    tok = client.post("/api/auth/login", json={"password": "pcmanager"}).json()["token"]
    return {"Authorization": f"Bearer {tok}"}


@pytest.mark.parametrize("bad", ["-h", "--rm", "", "a b", "x;rm", "$(id)"])
def test_ref_rejects_flags_and_shell(bad):
    with pytest.raises(HTTPException):
        docker._ref(bad)


@pytest.mark.parametrize("good", ["abc123def456", "my_app-1", "nginx:1.27", "ghcr.io/org/img:tag", "img@sha256:abc"])
def test_ref_accepts_real_refs(good):
    assert docker._ref(good) == good


def test_endpoints_reject_flag_injection():
    h = _h()
    assert client.post("/api/docker/container/stop?container_id=--help", headers=h).status_code == 400
    assert client.post("/api/docker/images/pull", headers=h, json={"image": "--all-tags"}).status_code == 400
    assert client.post("/api/docker/prune?target=everything", headers=h).status_code == 400


def test_ws_require_token():
    for path in ("/api/docker/logs/abc/ws", "/api/docker/exec/abc"):
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(path) as ws:
                ws.receive_text()


@pytest.fixture
def fake_docker(tmp_path, monkeypatch):
    script = tmp_path / "fakedocker"
    script.write_text(
        "#!/bin/sh\n"
        "if [ \"$1\" = logs ]; then echo satir-1; echo satir-2; exit 0; fi\n"
        "if [ \"$1\" = exec ]; then echo konteyner-kabugu; read x; echo \"girdi:$x\"; exit 0; fi\n"
    )
    script.chmod(0o755)
    monkeypatch.setattr(docker, "_RUNTIME", str(script))
    from routers import terminal
    monkeypatch.setattr(terminal, "RECORDINGS_DIR", tmp_path / "rec")
    monkeypatch.setattr(terminal, "RECORDINGS_INDEX", tmp_path / "rec" / "index.json")
    return script


def _token():
    return client.post("/api/auth/login", json={"password": "pcmanager"}).json()["token"]


def test_live_logs_stream(fake_docker):
    with client.websocket_connect(f"/api/docker/logs/abc/ws?token={_token()}") as ws:
        assert ws.receive_text() == "satir-1"
        assert ws.receive_text() == "satir-2"


def test_exec_runs_in_pty_and_is_recorded(fake_docker):
    from routers import terminal
    out = ""
    with client.websocket_connect(f"/api/docker/exec/abc?token={_token()}") as ws:
        while "konteyner-kabugu" not in out:
            out += ws.receive_text()
        ws.send_text("merhaba\r")
        while "girdi:merhaba" not in out:
            out += ws.receive_text()
    index = terminal._load_index()
    assert index and index[0]["label"] == "docker exec abc"
