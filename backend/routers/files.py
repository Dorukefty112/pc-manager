import os
import shutil
import tarfile
import zipfile
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse
from .backups import safe_extract

router = APIRouter(tags=["files"])

MAX_EDIT_BYTES = 2 * 1024 * 1024
ARCHIVE_SUFFIXES = (".tar.gz", ".tgz", ".tar", ".tar.bz2", ".tar.xz", ".zip")


def _safe_name(name: str) -> str:
    # Yalnızca ad: '/' veya '..' ile başka dizine yazmayı engelle
    name = (name or "").strip()
    if not name or name in (".", "..") or "/" in name or "\x00" in name:
        raise HTTPException(400, "Geçersiz dosya adı")
    return name


def _existing(paths: list[str]) -> list[Path]:
    out = []
    for raw in paths:
        p = Path(raw).resolve()
        if not p.exists() and not p.is_symlink():
            raise HTTPException(404, f"Bulunamadı: {raw}")
        if p == Path("/"):
            raise HTTPException(400, "Kök dizin üzerinde toplu işlem yapılamaz")
        out.append(p)
    return out

@router.get("/files/list")
def list_files(path: str = Query("/", alias="path")):
    try:
        p = Path(path).resolve()
        if not p.exists():
            raise HTTPException(404, "path not found")
        items = []
        for entry in sorted(p.iterdir(), key=lambda x: x.name.lower()):
            try:
                stat = entry.lstat()
                is_dir = stat.st_mode & 0o40000  # S_IFDIR
                items.append({
                    "name": entry.name,
                    "path": str(entry),
                    "is_dir": bool(is_dir),
                    "size": stat.st_size,
                    "mtime": stat.st_mtime,
                    "mode": stat.st_mode
                })
            except (PermissionError, OSError):
                continue
        items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
        return {"path": str(p), "parent": str(p.parent) if str(p) != "/" else None, "items": items}
    except PermissionError:
        raise HTTPException(403, "permission denied")
    except Exception as e:
        raise HTTPException(400, str(e))

@router.get("/files/download")
def download_file(path: str = Query(alias="path")):
    p = Path(path).resolve()
    if not p.exists() or not p.is_file():
        raise HTTPException(404, "file not found")
    return FileResponse(str(p), filename=p.name)

@router.post("/files/upload")
async def upload_file(dest: str = Query(alias="dest"), file: UploadFile = File(...)):
    dest_path = Path(dest).resolve()
    if not dest_path.is_dir():
        raise HTTPException(400, "destination must be a directory")
    file_path = dest_path / _safe_name(os.path.basename(file.filename or ""))
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
    return {"success": True, "path": str(file_path)}

@router.delete("/files/delete")
def delete_item(path: str = Query(alias="path")):
    p = Path(path).resolve()
    if not p.exists():
        raise HTTPException(404, "not found")
    if p.is_dir():
        shutil.rmtree(str(p))
    else:
        p.unlink()
    return {"success": True}

@router.post("/files/mkdir")
def create_dir(path: str = Query(alias="path")):
    p = Path(path).resolve()
    p.mkdir(parents=True, exist_ok=True)
    return {"success": True, "path": str(p)}

@router.put("/files/rename")
def rename_item(path: str = Query(alias="path"), new_name: str = Query(alias="new_name")):
    p = Path(path).resolve()
    if not p.exists():
        raise HTTPException(404, "not found")
    new_path = p.parent / _safe_name(new_name)
    if new_path.exists():
        raise HTTPException(409, "Bu adda bir öğe zaten var")
    p.rename(new_path)
    return {"success": True, "path": str(new_path)}

@router.get("/files/search")
def search_files(query: str = Query(alias="q"), root: str = Query("/")):
    results = []
    try:
        for dirpath, dirnames, filenames in os.walk(root):
            for name in filenames + dirnames:
                if query.lower() in name.lower():
                    full = os.path.join(dirpath, name)
                    try:
                        stat = os.stat(full)
                        results.append({"name": name, "path": full, "is_dir": os.path.isdir(full), "size": stat.st_size})
                    except: pass
            if len(results) >= 200:
                break
    except: pass
    return results


@router.get("/files/read")
def read_file(path: str = Query(alias="path")):
    p = Path(path).resolve()
    if not p.is_file():
        raise HTTPException(404, "file not found")
    st = p.stat()
    if st.st_size > MAX_EDIT_BYTES:
        raise HTTPException(413, f"Dosya düzenlemek için çok büyük (> {MAX_EDIT_BYTES // 1024 // 1024} MB)")
    data = p.read_bytes()
    if b"\0" in data[:8192]:
        return {"path": str(p), "binary": True, "size": st.st_size, "mtime": st.st_mtime}
    return {"path": str(p), "binary": False, "size": st.st_size, "mtime": st.st_mtime,
            "content": data.decode("utf-8", errors="replace")}


@router.put("/files/write")
def write_file(body: dict):
    p = Path(body.get("path", "")).resolve()
    content = body.get("content")
    if not isinstance(content, str):
        raise HTTPException(400, "content gerekli")
    if p.exists():
        if not p.is_file():
            raise HTTPException(400, "Hedef bir dosya değil")
        expected = body.get("expected_mtime")
        # Başka biri dosyayı değiştirdiyse üzerine yazmadan önce uyar
        if expected is not None and abs(p.stat().st_mtime - float(expected)) > 1e-3:
            raise HTTPException(409, "Dosya siz düzenlerken değişmiş. Yeniden yükleyip tekrar deneyin.")
        mode = p.stat().st_mode
    else:
        if not p.parent.is_dir():
            raise HTTPException(400, "Üst dizin yok")
        mode = None
    tmp = p.with_name(f".{p.name}.pcm-tmp")
    tmp.write_text(content, encoding="utf-8")
    if mode is not None:
        os.chmod(tmp, mode & 0o7777)
        try:
            st = p.stat()
            os.chown(tmp, st.st_uid, st.st_gid)
        except (PermissionError, OSError):
            pass
    tmp.replace(p)
    return {"success": True, "mtime": p.stat().st_mtime, "size": p.stat().st_size}


@router.post("/files/bulk-delete")
def bulk_delete(body: dict):
    deleted = 0
    for p in _existing(body.get("paths", [])):
        if p.is_dir() and not p.is_symlink():
            shutil.rmtree(p)
        else:
            p.unlink()
        deleted += 1
    return {"success": True, "deleted": deleted}


def _transfer(body: dict, move: bool):
    dest = Path(body.get("dest", "")).resolve()
    if not dest.is_dir():
        raise HTTPException(400, "Hedef bir dizin olmalı")
    done = []
    for p in _existing(body.get("paths", [])):
        target = dest / p.name
        if target.exists():
            raise HTTPException(409, f"Hedefte zaten var: {target}")
        if p.is_dir() and (dest == p or p in dest.parents):
            raise HTTPException(400, "Bir dizin kendi içine kopyalanamaz/taşınamaz")
        if move:
            shutil.move(str(p), str(target))
        elif p.is_dir() and not p.is_symlink():
            shutil.copytree(p, target, symlinks=True)
        else:
            shutil.copy2(p, target, follow_symlinks=False)
        done.append(str(target))
    return {"success": True, "paths": done}


@router.post("/files/copy")
def copy_items(body: dict):
    return _transfer(body, move=False)


@router.post("/files/move")
def move_items(body: dict):
    return _transfer(body, move=True)


@router.post("/files/archive")
def create_archive(body: dict):
    """Seçili öğeleri tek bir .tar.gz veya .zip arşivine koy."""
    items = _existing(body.get("paths", []))
    dest = Path(body.get("dest", "")).resolve()
    if not dest.parent.is_dir():
        raise HTTPException(400, "Hedef dizin yok")
    if dest.exists():
        raise HTTPException(409, "Arşiv dosyası zaten var")
    if dest.name.endswith(".zip"):
        with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zf:
            for item in items:
                if item.is_dir():
                    for root, _, files in os.walk(item):
                        for f in files:
                            full = Path(root) / f
                            zf.write(full, full.relative_to(item.parent))
                else:
                    zf.write(item, item.name)
    elif dest.name.endswith((".tar.gz", ".tgz")):
        with tarfile.open(dest, "w:gz") as tar:
            for item in items:
                tar.add(item, arcname=item.name)
    else:
        raise HTTPException(400, "Arşiv adı .tar.gz, .tgz veya .zip ile bitmeli")
    return {"success": True, "path": str(dest), "size": dest.stat().st_size}


@router.post("/files/extract")
def extract_archive(body: dict):
    src = Path(body.get("path", "")).resolve()
    if not src.is_file() or not src.name.lower().endswith(ARCHIVE_SUFFIXES):
        raise HTTPException(400, "Desteklenen bir arşiv değil")
    dest = Path(body.get("dest") or src.parent).resolve()
    dest.mkdir(parents=True, exist_ok=True)
    try:
        if src.name.lower().endswith(".zip"):
            with zipfile.ZipFile(src) as zf:
                root = os.path.realpath(dest)
                for name in zf.namelist():
                    target = os.path.realpath(os.path.join(root, name))
                    if not (target == root or target.startswith(root + os.sep)):
                        raise ValueError(f"hedef dışına yazma: {name}")
                zf.extractall(dest)
                count = len([n for n in zf.namelist() if not n.endswith("/")])
        else:
            with tarfile.open(src) as tar:
                members = tar.getmembers()
                safe_extract(tar, members, str(dest))
                count = sum(1 for m in members if m.isfile())
    except (tarfile.TarError, zipfile.BadZipFile, ValueError) as e:
        raise HTTPException(400, f"Arşiv açılamadı: {e}")
    return {"success": True, "dest": str(dest), "files": count}
