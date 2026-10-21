import io
import os
import tarfile
import zipfile
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def _h():
    tok = client.post("/api/auth/login", json={"password": "pcmanager"}).json()["token"]
    return {"Authorization": f"Bearer {tok}"}


def test_read_write_preserves_mode_and_detects_conflict(tmp_path):
    h = _h()
    f = tmp_path / "ayar.conf"
    f.write_text("a=1\n")
    os.chmod(f, 0o640)
    r = client.get(f"/api/files/read?path={f}", headers=h).json()
    assert r["content"] == "a=1\n" and not r["binary"]
    w = client.put("/api/files/write", headers=h, json={"path": str(f), "content": "a=2\n", "expected_mtime": r["mtime"]})
    assert w.status_code == 200
    assert f.read_text() == "a=2\n" and (f.stat().st_mode & 0o777) == 0o640
    # eski mtime ile yazma çakışma vermeli
    stale = client.put("/api/files/write", headers=h, json={"path": str(f), "content": "x", "expected_mtime": r["mtime"] - 100})
    assert stale.status_code == 409 and f.read_text() == "a=2\n"


def test_read_binary_and_too_large(tmp_path):
    h = _h()
    b = tmp_path / "bin"
    b.write_bytes(b"\x00\x01\x02")
    assert client.get(f"/api/files/read?path={b}", headers=h).json()["binary"] is True
    big = tmp_path / "big"
    big.write_bytes(b"a" * (2 * 1024 * 1024 + 1))
    assert client.get(f"/api/files/read?path={big}", headers=h).status_code == 413


def test_rename_and_upload_reject_traversal(tmp_path):
    h = _h()
    (tmp_path / "d").mkdir()
    f = tmp_path / "d" / "x.txt"
    f.write_text("x")
    assert client.put(f"/api/files/rename?path={f}&new_name=../kacis.txt", headers=h).status_code == 400
    assert f.exists()
    files = {"file": ("../../kacis.txt", io.BytesIO(b"pwn"), "text/plain")}
    r = client.post(f"/api/files/upload?dest={tmp_path / 'd'}", headers=h, files=files)
    assert r.status_code == 200 and (tmp_path / "d" / "kacis.txt").exists()
    assert not (tmp_path.parent / "kacis.txt").exists()


def test_bulk_copy_move_delete(tmp_path):
    h = _h()
    src, dst = tmp_path / "src", tmp_path / "dst"
    (src / "klasor").mkdir(parents=True)
    dst.mkdir()
    (src / "a.txt").write_text("a")
    (src / "klasor" / "b.txt").write_text("b")
    paths = [str(src / "a.txt"), str(src / "klasor")]
    assert client.post("/api/files/copy", headers=h, json={"paths": paths, "dest": str(dst)}).status_code == 200
    assert (dst / "klasor" / "b.txt").read_text() == "b" and (src / "a.txt").exists()
    assert client.post("/api/files/copy", headers=h, json={"paths": paths, "dest": str(dst)}).status_code == 409
    assert client.post("/api/files/copy", headers=h, json={"paths": [str(src)], "dest": str(src / "klasor")}).status_code == 400
    r = client.post("/api/files/bulk-delete", headers=h, json={"paths": [str(dst / "a.txt"), str(dst / "klasor")]})
    assert r.json()["deleted"] == 2 and not any(dst.iterdir())
    assert client.post("/api/files/move", headers=h, json={"paths": paths, "dest": str(dst)}).status_code == 200
    assert not (src / "a.txt").exists() and (dst / "a.txt").exists()
    assert client.post("/api/files/bulk-delete", headers=h, json={"paths": ["/"]}).status_code == 400


def test_archive_and_extract_roundtrip(tmp_path):
    h = _h()
    (tmp_path / "proje" / "alt").mkdir(parents=True)
    (tmp_path / "proje" / "alt" / "c.txt").write_text("c")
    for ext in ("tar.gz", "zip"):
        arch = tmp_path / f"yedek.{ext}"
        r = client.post("/api/files/archive", headers=h, json={"paths": [str(tmp_path / "proje")], "dest": str(arch)})
        assert r.status_code == 200, r.text
        out = tmp_path / f"acik-{ext}"
        r = client.post("/api/files/extract", headers=h, json={"path": str(arch), "dest": str(out)})
        assert r.status_code == 200 and r.json()["files"] == 1
        assert (out / "proje" / "alt" / "c.txt").read_text() == "c"


def test_extract_rejects_zip_slip(tmp_path):
    h = _h()
    evil = tmp_path / "evil.zip"
    with zipfile.ZipFile(evil, "w") as zf:
        zf.writestr("../../kacis.txt", "pwn")
    r = client.post("/api/files/extract", headers=h, json={"path": str(evil), "dest": str(tmp_path / "out")})
    assert r.status_code == 400
    assert not (tmp_path.parent / "kacis.txt").exists()
