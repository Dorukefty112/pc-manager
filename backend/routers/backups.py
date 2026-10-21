"""Zamanlanmış dosya yedekleri.

Görevler config.json içindeki "backups.jobs" listesinde tutulur. Her çalıştırma
kaynakları tek bir .tar.gz arşivine yazar; arşiv yolları köke göre görelidir
(örn. etc/nginx/nginx.conf), böylece geri yükleme hedef dizinin altında aynı
ağacı yeniden kurar. Hedef dizinde görev başına en fazla `keep` arşiv kalır.
"""
import os
import re
import json
import time
import uuid
import fnmatch
import tarfile
import threading
from pathlib import Path
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter(tags=["backups"])

BACKEND_DIR = Path(__file__).parent.parent
CONFIG_PATH = BACKEND_DIR / "config.json"
RUNS_PATH = BACKEND_DIR / "backup_runs.json"
RUNS_LIMIT = 200
SCHEDULES = ("manual", "hourly", "daily", "weekly")
ARCHIVE_RE = re.compile(r"^[a-z0-9-]+-\d{8}-\d{6}\.tar\.gz$")

_lock = threading.Lock()
_running: set[str] = set()
_scheduler_running = False


def _load_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return {}


def _save_config(cfg: dict):
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2, ensure_ascii=False))


def get_jobs() -> list[dict]:
    return _load_config().get("backups", {}).get("jobs", [])


def _save_jobs(jobs: list[dict]):
    with _lock:
        cfg = _load_config()
        cfg.setdefault("backups", {})["jobs"] = jobs
        _save_config(cfg)


def _load_runs() -> list[dict]:
    if RUNS_PATH.exists():
        try:
            return json.loads(RUNS_PATH.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return []


def _upsert_run(run: dict):
    with _lock:
        runs = [r for r in _load_runs() if r["id"] != run["id"]]
        runs.insert(0, run)
        RUNS_PATH.write_text(json.dumps(runs[:RUNS_LIMIT], indent=2, ensure_ascii=False))


def slugify(name: str) -> str:
    table = str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU")
    slug = re.sub(r"[^a-z0-9]+", "-", name.translate(table).lower()).strip("-")
    return slug[:40] or "yedek"


def validate_job(body: dict, existing_id: str | None = None) -> dict:
    name = (body.get("name") or "").strip()
    if not name:
        raise ValueError("Görev adı gerekli")
    sources = [s.strip() for s in body.get("sources", []) if s and s.strip()]
    if not sources:
        raise ValueError("En az bir kaynak yolu gerekli")
    for s in sources:
        if not os.path.isabs(s):
            raise ValueError(f"Kaynak mutlak yol olmalı: {s}")
    dest = (body.get("dest") or "").strip()
    if not dest or not os.path.isabs(dest):
        raise ValueError("Hedef dizin mutlak yol olmalı")
    schedule = body.get("schedule", "daily")
    if schedule not in SCHEDULES:
        raise ValueError("Geçersiz zamanlama")
    at = (body.get("time") or "03:00").strip()
    if not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", at):
        raise ValueError("Saat SS:DD biçiminde olmalı")
    return {
        "id": existing_id or uuid.uuid4().hex[:10],
        "name": name[:80],
        "sources": sources,
        "dest": dest,
        "excludes": [e.strip() for e in body.get("excludes", []) if e and e.strip()],
        "schedule": schedule,
        "time": at,
        "weekday": max(0, min(6, int(body.get("weekday", 0)))),
        "keep": max(1, min(365, int(body.get("keep", 7)))),
        "enabled": bool(body.get("enabled", True)),
    }


def is_due(job: dict, last_started: float | None, now: datetime) -> bool:
    if not job.get("enabled", True) or job.get("schedule") == "manual":
        return False
    last = datetime.fromtimestamp(last_started) if last_started else None
    if job["schedule"] == "hourly":
        return last is None or now - last >= timedelta(hours=1)
    hh, mm = map(int, job.get("time", "03:00").split(":"))
    slot = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
    if job["schedule"] == "weekly":
        slot -= timedelta(days=(now.weekday() - job.get("weekday", 0)) % 7)
    if slot > now:
        slot -= timedelta(days=7 if job["schedule"] == "weekly" else 1)
    return last is None or last < slot


def _excluded(path: str, patterns: list[str]) -> bool:
    name = os.path.basename(path)
    return any(fnmatch.fnmatch(name, p) or fnmatch.fnmatch(path, p) for p in patterns)


def list_archives(job: dict) -> list[dict]:
    dest = Path(job["dest"])
    prefix = slugify(job["name"]) + "-"
    if not dest.is_dir():
        return []
    out = []
    for p in dest.iterdir():
        if p.name.startswith(prefix) and ARCHIVE_RE.match(p.name) and p.is_file():
            st = p.stat()
            out.append({"name": p.name, "size": st.st_size, "mtime": int(st.st_mtime)})
    out.sort(key=lambda a: a["name"], reverse=True)
    return out


def _apply_retention(job: dict) -> list[str]:
    removed = []
    for a in list_archives(job)[job["keep"]:]:
        try:
            (Path(job["dest"]) / a["name"]).unlink()
            removed.append(a["name"])
        except OSError:
            pass
    return removed


def run_job(job: dict, run_id: str | None = None) -> dict:
    run = {
        "id": run_id or uuid.uuid4().hex[:12],
        "job_id": job["id"],
        "job_name": job["name"],
        "started": time.time(),
        "ended": None,
        "status": "running",
        "file": None,
        "size": 0,
        "files": 0,
        "skipped": [],
        "error": None,
    }
    _upsert_run(run)
    dest = Path(job["dest"])
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    target = dest / f"{slugify(job['name'])}-{stamp}.tar.gz"
    partial = target.with_name(target.name + ".part")
    dest_real = os.path.realpath(dest)
    counter = {"files": 0}

    def tar_filter(info: tarfile.TarInfo):
        full = "/" + info.name
        real = os.path.realpath(full)
        # Hedef dizin kaynağın içindeyse yedeği kendine eklemeyelim
        if real == dest_real or real.startswith(dest_real + os.sep):
            return None
        if _excluded(full, job.get("excludes", [])):
            return None
        if info.isfile():
            counter["files"] += 1
        return info

    try:
        dest.mkdir(parents=True, exist_ok=True)
        with tarfile.open(partial, "w:gz") as tar:
            for src in job["sources"]:
                if not os.path.exists(src):
                    run["skipped"].append(src)
                    continue
                tar.add(src, arcname=os.path.abspath(src).lstrip("/"), filter=tar_filter)
        partial.replace(target)
        run.update(status="success", file=target.name, size=target.stat().st_size, files=counter["files"])
        run["removed"] = _apply_retention(job)
    except Exception as e:
        partial.unlink(missing_ok=True)
        run.update(status="failed", error=str(e)[:500])
    run["ended"] = time.time()
    _upsert_run(run)
    return run


def safe_extract(tar: tarfile.TarFile, members: list[tarfile.TarInfo], target: str):
    if hasattr(tarfile, "data_filter"):
        # 'data' filtresi mutlak yolları, '..' kaçışlarını, dışarı işaret eden
        # bağlantıları ve cihaz dosyalarını reddeder (Python 3.11.4+)
        tar.extractall(target, members=members, filter="data")
        return
    root = os.path.realpath(target)
    for m in members:
        dest = os.path.realpath(os.path.join(root, m.name))
        if m.name.startswith("/") or not (dest == root or dest.startswith(root + os.sep)):
            raise ValueError(f"hedef dışına yazma: {m.name}")
        if m.isdev():
            raise ValueError(f"cihaz dosyası: {m.name}")
        if m.issym() or m.islnk():
            link = os.path.realpath(os.path.join(os.path.dirname(dest), m.linkname))
            if not link.startswith(root + os.sep):
                raise ValueError(f"dışarı işaret eden bağlantı: {m.name}")
    tar.extractall(target, members=members)


def start_run(job: dict) -> str:
    with _lock:
        if job["id"] in _running:
            raise RuntimeError("Bu görev zaten çalışıyor")
        _running.add(job["id"])
    run_id = uuid.uuid4().hex[:12]

    def worker():
        try:
            run_job(job, run_id)
        finally:
            with _lock:
                _running.discard(job["id"])

    threading.Thread(target=worker, daemon=True, name=f"backup-{job['id']}").start()
    return run_id


def _last_started(job_id: str, runs: list[dict]) -> float | None:
    return next((r["started"] for r in runs if r["job_id"] == job_id), None)


def start_scheduler():
    global _scheduler_running
    if _scheduler_running:
        return
    _scheduler_running = True

    def loop():
        while _scheduler_running:
            try:
                runs = _load_runs()
                now = datetime.now()
                for job in get_jobs():
                    if job["id"] not in _running and is_due(job, _last_started(job["id"], runs), now):
                        start_run(job)
            except Exception:
                pass
            time.sleep(60)

    threading.Thread(target=loop, daemon=True, name="backup-scheduler").start()


def stop_scheduler():
    global _scheduler_running
    _scheduler_running = False


def _job_or_404(job_id: str) -> dict:
    job = next((j for j in get_jobs() if j["id"] == job_id), None)
    if not job:
        raise HTTPException(404, "Yedekleme görevi bulunamadı")
    return job


def _archive_path(job: dict, name: str) -> Path:
    if not ARCHIVE_RE.match(name) or not name.startswith(slugify(job["name"]) + "-"):
        raise HTTPException(400, "Geçersiz arşiv adı")
    p = Path(job["dest"]) / name
    if not p.is_file():
        raise HTTPException(404, "Arşiv bulunamadı")
    return p


@router.get("/backups/jobs")
def jobs():
    runs = _load_runs()
    out = []
    for job in get_jobs():
        last = next((r for r in runs if r["job_id"] == job["id"]), None)
        out.append({**job, "running": job["id"] in _running, "last_run": last})
    return out


@router.get("/backups/presets")
def presets():
    """Hızlı başlangıç: PC Manager'ın kendi ayar dosyaları."""
    files = ["config.json", "playbooks.json", "alert_history.json", "playbook_runs.json"]
    return [{
        "name": "PC Manager ayarları",
        "sources": [str(BACKEND_DIR / f) for f in files if (BACKEND_DIR / f).exists()] or [str(BACKEND_DIR / "config.json")],
        "dest": "/var/backups/pc-manager",
        "schedule": "daily",
        "time": "03:00",
        "keep": 14,
        "excludes": [],
    }]


@router.post("/backups/jobs")
def create_job(body: dict):
    try:
        job = validate_job(body)
    except (ValueError, TypeError) as e:
        raise HTTPException(400, str(e))
    _save_jobs(get_jobs() + [job])
    return job


@router.put("/backups/jobs/{job_id}")
def update_job(job_id: str, body: dict):
    _job_or_404(job_id)
    try:
        job = validate_job(body, existing_id=job_id)
    except (ValueError, TypeError) as e:
        raise HTTPException(400, str(e))
    _save_jobs([job if j["id"] == job_id else j for j in get_jobs()])
    return job


@router.delete("/backups/jobs/{job_id}")
def delete_job(job_id: str):
    _job_or_404(job_id)
    _save_jobs([j for j in get_jobs() if j["id"] != job_id])
    return {"success": True}


@router.post("/backups/jobs/{job_id}/run")
def run_now(job_id: str):
    job = _job_or_404(job_id)
    try:
        return {"run_id": start_run(job)}
    except RuntimeError as e:
        raise HTTPException(409, str(e))


@router.get("/backups/runs")
def runs(job_id: str = ""):
    items = _load_runs()
    return [r for r in items if r["job_id"] == job_id] if job_id else items


@router.get("/backups/jobs/{job_id}/archives")
def archives(job_id: str):
    return list_archives(_job_or_404(job_id))


@router.get("/backups/jobs/{job_id}/archives/{name}")
def download_archive(job_id: str, name: str):
    p = _archive_path(_job_or_404(job_id), name)
    return FileResponse(str(p), filename=p.name, media_type="application/gzip")


@router.delete("/backups/jobs/{job_id}/archives/{name}")
def delete_archive(job_id: str, name: str):
    _archive_path(_job_or_404(job_id), name).unlink()
    return {"success": True}


@router.get("/backups/jobs/{job_id}/archives/{name}/contents")
def archive_contents(job_id: str, name: str, limit: int = 500):
    p = _archive_path(_job_or_404(job_id), name)
    items = []
    with tarfile.open(p, "r:gz") as tar:
        for m in tar:
            items.append({"name": m.name, "size": m.size, "dir": m.isdir()})
            if len(items) >= limit:
                break
    return {"items": items, "truncated": len(items) >= limit}


@router.post("/backups/jobs/{job_id}/archives/{name}/restore")
def restore_archive(job_id: str, name: str, body: dict):
    """Arşivi `target` dizinine açar. Hedef '/' ise dosyalar yerine yazılır."""
    p = _archive_path(_job_or_404(job_id), name)
    target = (body.get("target") or "").strip()
    if not target or not os.path.isabs(target):
        raise HTTPException(400, "Hedef mutlak bir dizin olmalı")
    Path(target).mkdir(parents=True, exist_ok=True)
    count = 0
    with tarfile.open(p, "r:gz") as tar:
        members = tar.getmembers()
        try:
            safe_extract(tar, members, target)
        except (tarfile.TarError, ValueError) as e:
            raise HTTPException(400, f"Arşiv güvenli değil veya bozuk: {e}")
        count = sum(1 for m in members if m.isfile())
    return {"success": True, "files": count, "target": target}
