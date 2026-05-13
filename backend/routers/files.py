import os
import shutil
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse

router = APIRouter(tags=["files"])

@router.get("/files/list")
def list_files(path: str = Query("/", alias="path")):
    try:
        p = Path(path).resolve()
        if not p.exists():
            raise HTTPException(404, "path not found")
        items = []
        for entry in sorted(p.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower())):
            try:
                stat = entry.lstat()
                items.append({
                    "name": entry.name,
                    "path": str(entry),
                    "is_dir": entry.is_dir(),
                    "size": stat.st_size,
                    "mtime": stat.st_mtime,
                    "mode": stat.st_mode
                })
            except (PermissionError, OSError):
                continue
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
    file_path = dest_path / file.filename
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
    new_path = p.parent / new_name
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
