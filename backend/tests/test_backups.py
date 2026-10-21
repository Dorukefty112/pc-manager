import io
import json
import tarfile
import pytest
from pathlib import Path
from datetime import datetime
from fastapi.testclient import TestClient
from routers import backups
from main import app

client = TestClient(app)


@pytest.fixture
def env(tmp_path, monkeypatch):
    cfg = tmp_path / "config.json"
    monkeypatch.setattr(backups, "CONFIG_PATH", cfg)
    monkeypatch.setattr(backups, "RUNS_PATH", tmp_path / "runs.json")
    src = tmp_path / "src"
    (src / "alt").mkdir(parents=True)
    (src / "a.txt").write_text("merhaba")
    (src / "alt" / "b.txt").write_text("dünya")
    (src / "gecici.log").write_text("x")
    return tmp_path, src


def _job(tmp, src, **kw):
    return backups.validate_job({"name": "Test Yedeği", "sources": [str(src)], "dest": str(tmp / "out"),
                                 "excludes": ["*.log"], "keep": 2, **kw})


def test_run_creates_archive_with_excludes(env):
    tmp, src = env
    run = backups.run_job(_job(tmp, src))
    assert run["status"] == "success" and run["files"] == 2
    archive = tmp / "out" / run["file"]
    assert archive.name.startswith("test-yedegi-")
    with tarfile.open(archive) as tar:
        names = tar.getnames()
    rel = str(src).lstrip("/")
    assert f"{rel}/a.txt" in names and f"{rel}/alt/b.txt" in names
    assert not any(n.endswith(".log") for n in names)


def test_dest_inside_source_is_not_archived_into_itself(env):
    tmp, src = env
    job = backups.validate_job({"name": "ic", "sources": [str(src)], "dest": str(src / "yedekler")})
    backups.run_job(job)
    run = backups.run_job(job)
    with tarfile.open(src / "yedekler" / run["file"]) as tar:
        assert not any("yedekler" in n for n in tar.getnames())


def test_retention_keeps_latest(env, monkeypatch):
    tmp, src = env
    job = _job(tmp, src)
    stamps = iter(["20250101-000001", "20250101-000002", "20250101-000003"])

    class FakeDT(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime.strptime(next(stamps), "%Y%m%d-%H%M%S")
    monkeypatch.setattr(backups, "datetime", FakeDT)
    for _ in range(3):
        backups.run_job(job)
    names = [a["name"] for a in backups.list_archives(job)]
    assert names == ["test-yedegi-20250101-000003.tar.gz", "test-yedegi-20250101-000002.tar.gz"]


def test_missing_source_is_skipped_not_fatal(env):
    tmp, src = env
    job = backups.validate_job({"name": "x", "sources": [str(src), "/yok/boyle/bir/yol"], "dest": str(tmp / "o")})
    run = backups.run_job(job)
    assert run["status"] == "success" and run["skipped"] == ["/yok/boyle/bir/yol"]


@pytest.mark.parametrize("job,last,now,due", [
    ({"schedule": "manual"}, None, "2025-01-02 10:00", False),
    ({"schedule": "hourly"}, None, "2025-01-02 10:00", True),
    ({"schedule": "hourly"}, "2025-01-02 09:30", "2025-01-02 10:00", False),
    ({"schedule": "daily", "time": "03:00"}, "2025-01-01 03:00", "2025-01-02 02:59", False),
    ({"schedule": "daily", "time": "03:00"}, "2025-01-01 03:00", "2025-01-02 03:01", True),
    ({"schedule": "daily", "time": "03:00"}, "2025-01-02 03:00", "2025-01-02 23:00", False),
    # 2025-01-06 Pazartesi (weekday 0)
    ({"schedule": "weekly", "time": "04:00", "weekday": 0}, "2024-12-30 04:00", "2025-01-05 12:00", False),
    ({"schedule": "weekly", "time": "04:00", "weekday": 0}, "2024-12-30 04:00", "2025-01-06 04:05", True),
    ({"schedule": "daily", "time": "03:00", "enabled": False}, None, "2025-01-02 10:00", False),
])
def test_is_due(job, last, now, due):
    parse = lambda s: datetime.strptime(s, "%Y-%m-%d %H:%M")
    last_ts = parse(last).timestamp() if last else None
    assert backups.is_due(job, last_ts, parse(now)) is due


def test_validation_errors():
    for body in ({}, {"name": "x"}, {"name": "x", "sources": ["rel/path"], "dest": "/d"},
                 {"name": "x", "sources": ["/a"], "dest": "/d", "schedule": "yearly"},
                 {"name": "x", "sources": ["/a"], "dest": "/d", "time": "25:00"}):
        with pytest.raises(ValueError):
            backups.validate_job(body)


def _h():
    tok = client.post("/api/auth/login", json={"password": "pcmanager"}).json()["token"]
    return {"Authorization": f"Bearer {tok}"}


def test_api_roundtrip_and_restore(env):
    tmp, src = env
    h = _h()
    job = client.post("/api/backups/jobs", headers=h, json={
        "name": "api", "sources": [str(src)], "dest": str(tmp / "out"), "schedule": "manual"}).json()
    run = backups.run_job(backups._job_or_404(job["id"]))
    arch = client.get(f"/api/backups/jobs/{job['id']}/archives", headers=h).json()
    assert arch[0]["name"] == run["file"]
    dl = client.get(f"/api/backups/jobs/{job['id']}/archives/{run['file']}", headers=h)
    assert dl.status_code == 200 and dl.content[:2] == b"\x1f\x8b"
    res = client.post(f"/api/backups/jobs/{job['id']}/archives/{run['file']}/restore",
                      headers=h, json={"target": str(tmp / "geri")}).json()
    assert res["files"] == 3
    assert (tmp / "geri" / str(src).lstrip("/") / "alt" / "b.txt").read_text() == "dünya"
    assert client.get(f"/api/backups/jobs/{job['id']}/archives/evil.tar.gz", headers=h).status_code == 400


def test_restore_rejects_path_traversal(env, tmp_path):
    tmp, src = env
    evil = tmp_path / "evil.tar.gz"
    with tarfile.open(evil, "w:gz") as tar:
        data = b"pwned"
        info = tarfile.TarInfo("../../kacis.txt")
        info.size = len(data)
        tar.addfile(info, io.BytesIO(data))
    with tarfile.open(evil) as tar:
        with pytest.raises((tarfile.TarError, ValueError)):
            backups.safe_extract(tar, tar.getmembers(), str(tmp_path / "hedef"))
    assert not (tmp_path.parent / "kacis.txt").exists()


def test_safe_extract_fallback_without_data_filter(env, tmp_path, monkeypatch):
    """Python 3.11.4 öncesinde tarfile.data_filter yok; elle doğrulama devreye girer."""
    monkeypatch.delattr(tarfile, "data_filter", raising=False)
    evil = tmp_path / "evil2.tar.gz"
    with tarfile.open(evil, "w:gz") as tar:
        link = tarfile.TarInfo("kotu-baglanti")
        link.type = tarfile.SYMTYPE
        link.linkname = "/etc/passwd"
        tar.addfile(link)
    with tarfile.open(evil) as tar:
        with pytest.raises(ValueError):
            backups.safe_extract(tar, tar.getmembers(), str(tmp_path / "h1"))
    tmp, src = env
    good = backups.run_job(_job(tmp, src))
    with tarfile.open(tmp / "out" / good["file"]) as tar:
        backups.safe_extract(tar, tar.getmembers(), str(tmp_path / "h2"))
    assert (tmp_path / "h2" / str(src).lstrip("/") / "a.txt").read_text() == "merhaba"
