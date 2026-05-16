import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def _get_token():
    res = client.post("/api/auth/login", json={"password": "pcmanager"})
    assert res.status_code == 200
    return res.json()["token"]

def _auth_headers():
    return {"Authorization": f"Bearer {_get_token()}"}

def test_login_success():
    res = client.post("/api/auth/login", json={"password": "pcmanager"})
    assert res.status_code == 200
    assert "token" in res.json()

def test_login_fail():
    res = client.post("/api/auth/login", json={"password": "wrong"})
    assert res.status_code == 401

def test_auth_required():
    res = client.get("/api/system/stats")
    assert res.status_code == 401

def test_system_stats():
    res = client.get("/api/system/stats", headers=_auth_headers())
    assert res.status_code == 200
    data = res.json()
    assert "cpu" in data
    assert "memory" in data
    assert "disk" in data
    assert "uptime" in data
    assert "hostname" in data

def test_system_info():
    res = client.get("/api/system/info", headers=_auth_headers())
    assert res.status_code == 200
    data = res.json()
    assert "hostname" in data
    assert "os" in data
    assert "kernel" in data

def test_processes():
    res = client.get("/api/processes", headers=_auth_headers())
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    if data:
        assert "pid" in data[0]
        assert "name" in data[0]

def test_network_interfaces():
    res = client.get("/api/network/interfaces", headers=_auth_headers())
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)

def test_disks_list():
    res = client.get("/api/disks/list", headers=_auth_headers())
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)

def test_files_list():
    res = client.get("/api/files/list?path=/", headers=_auth_headers())
    assert res.status_code == 200
    data = res.json()
    assert "path" in data
    assert "items" in data

def test_pentest_tools():
    res = client.get("/api/pentest/tools", headers=_auth_headers())
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) > 0
    assert "id" in data[0]
    assert "name" in data[0]
    assert "installed" in data[0]

def test_updates_check():
    res = client.get("/api/updates/check", headers=_auth_headers())
    assert res.status_code == 200
    data = res.json()
    assert "count" in data
    assert "updates" in data

def test_services():
    res = client.get("/api/services", headers=_auth_headers())
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)

def test_logs():
    res = client.get("/api/logs?lines=5", headers=_auth_headers())
    assert res.status_code == 200
    data = res.json()
    assert "lines" in data

def test_docker_info():
    res = client.get("/api/docker/info", headers=_auth_headers())
    assert res.status_code == 200

def test_cron_jobs():
    res = client.get("/api/cron/jobs", headers=_auth_headers())
    if res.status_code == 400:
        # cron may not be available in test env
        assert "cron" in res.text.lower()
    else:
        assert res.status_code == 200
        data = res.json()
        assert "jobs" in data

def test_unauthorized_access():
    endpoints = [
        "/api/system/stats",
        "/api/processes",
        "/api/network/interfaces",
        "/api/disks/list",
        "/api/pentest/tools",
        "/api/updates/check",
        "/api/services",
        "/api/docker/info",
        "/api/cron/jobs",
    ]
    for ep in endpoints:
        res = client.get(ep)
        assert res.status_code == 401, f"{ep} should require auth"

def test_power_not_authorized():
    """Power endpoints should require auth"""
    res = client.post("/api/power/shutdown")
    assert res.status_code == 401
    res = client.post("/api/power/reboot")
    assert res.status_code == 401


def test_ollama_emergency_requires_auth():
    """Emergency mode toggling should not be public."""
    res = client.get("/api/ollama/emergency")
    assert res.status_code == 401
    res = client.post("/api/ollama/emergency", json={"emergency": True})
    assert res.status_code == 401


def test_runtime_dependencies_declared():
    """Fresh installs should include dependencies required at import/runtime."""
    req_path = Path(__file__).resolve().parents[1] / "requirements.txt"
    requirements = req_path.read_text().splitlines()
    normalized = {
        line.strip().split("#", 1)[0].strip().lower()
        for line in requirements
        if line.strip() and not line.strip().startswith("#")
    }
    assert "python-multipart" in normalized
    assert "bcrypt" in normalized


def test_readme_version_badge_matches_version_file():
    """README badge should not drift behind the shipped VERSION file."""
    repo_root = Path(__file__).resolve().parents[2]
    version = (repo_root / "VERSION").read_text().strip()
    readme = (repo_root / "README.md").read_text()
    assert f"version-{version}-blue" in readme
