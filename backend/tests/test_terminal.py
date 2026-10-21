import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from routers import terminal
from main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def rec_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(terminal, "RECORDINGS_DIR", tmp_path / "rec")
    monkeypatch.setattr(terminal, "RECORDINGS_INDEX", tmp_path / "rec" / "index.json")
    monkeypatch.setenv("SHELL", "/bin/sh")


def _token():
    return client.post("/api/auth/login", json={"password": "pcmanager"}).json()["token"]


def _read_until(ws, needle, limit=200):
    out = ""
    for _ in range(limit):
        out += ws.receive_text()
        if needle in out:
            return out
    raise AssertionError(out)


def test_shell_has_controlling_tty_and_is_recorded():
    tok = _token()
    with client.websocket_connect(f"/api/terminal?token={tok}") as ws:
        ws.send_text("__RESIZE__:40:120")
        ws.send_text("tty; stty size; echo BIT\r")
        out = _read_until(ws, "BIT\r\n")
        assert "/dev/pts/" in out
        assert "40 120" in out
        ws.send_text("exit\r")
    items = terminal._load_index()
    assert len(items) == 1 and items[0]["ended"]
    h = {"Authorization": f"Bearer {tok}"}
    text = client.get(f"/api/terminal/recordings/{items[0]['id']}", headers=h).text
    assert "/dev/pts/" in text
    assert client.delete(f"/api/terminal/recordings/{items[0]['id']}", headers=h).status_code == 200
    assert terminal._load_index() == []


def test_recording_id_validated():
    h = {"Authorization": f"Bearer {_token()}"}
    assert client.get("/api/terminal/recordings/20250101-000000-zzzzzz", headers=h).status_code == 400
    assert client.get("/api/terminal/recordings/abc", headers=h).status_code == 400


def test_unknown_ssh_host_rejected():
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/api/terminal?token={_token()}&host=yok") as ws:
            ws.receive_text()


def test_ssh_target_validation(monkeypatch):
    cfg = {"remote_hosts": [
        {"id": "ok", "ssh": "user@10.0.0.5", "ssh_port": 2222},
        {"id": "bad", "ssh": "-oProxyCommand=id"},
    ]}
    monkeypatch.setattr(terminal, "_load_config", lambda: cfg)
    argv, label = terminal._ssh_argv("ok")
    assert argv == ["ssh", "-t", "-p", "2222", "--", "user@10.0.0.5"]
    assert terminal._ssh_argv("bad") is None
