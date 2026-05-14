import os
import re
import subprocess
from pathlib import Path
from fastapi import APIRouter, Query
import httpx

router = APIRouter(tags=["search"])


def _search_web(query: str, page: int = 1) -> dict:
    try:
        from ddgs import DDGS
        ddgs = DDGS(timeout=8)
        raw = list(ddgs.text(query, max_results=20))
        results = []
        for r in raw:
            results.append({
                "title": r.get("title", ""),
                "url": r.get("href", ""),
                "snippet": r.get("body", ""),
            })
        start = (page - 1) * 10
        paged = results[start:start + 10]
        return {"results": paged, "total": len(results), "page": page, "query": query}
    except ImportError:
        return {"error": "ddgs kutuphanesi eksik", "results": []}
    except Exception as e:
        return {"error": f"Arama hatasi: {str(e)}", "results": []}


def _search_local(query: str) -> dict:
    results = []
    search_dirs = [
        "/home",
    ]

    try:
        home = os.path.expanduser("~")
        search_dirs = [home]
    except:
        search_dirs = ["/tmp"]

    for d in search_dirs:
        if not os.path.isdir(d):
            continue
        try:
            result = subprocess.run(
                ["grep", "-r", "-l", "-i", query, d, "--include=*.txt", "--include=*.md",
                 "--include=*.py", "--include=*.js", "--include=*.json",
                 "--include=*.yml", "--include=*.yaml", "--include=*.conf",
                 "--include=*.cfg", "--include=*.log", "-m", "5"],
                capture_output=True, text=True, timeout=5
            )
            for line in result.stdout.strip().split("\n")[:20]:
                line = line.strip()
                if not line:
                    continue
                try:
                    content = Path(line).read_text(500, encoding="utf-8", errors="replace")
                    context_lines = [l.strip() for l in content.split("\n") if query.lower() in l.lower()]
                    snippet = (context_lines[0][:200] if context_lines else content[:200]).strip()
                except:
                    snippet = ""
                results.append({
                    "path": line,
                    "name": os.path.basename(line),
                    "snippet": snippet,
                })
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass

    return {"results": results, "total": len(results), "query": query}


def _search_system(query: str) -> dict:
    results = []

    processes = _search_processes(query)
    if processes:
        results.append({"category": "Process", "items": processes[:5]})

    services = _search_services(query)
    if services:
        results.append({"category": "Servis", "items": services[:5]})

    packages = _search_packages(query)
    if packages:
        results.append({"category": "Paket", "items": packages[:5]})

    return {"results": results, "total": sum(len(r["items"]) for r in results), "query": query}


def _search_processes(query: str) -> list:
    try:
        result = subprocess.run(
            ["ps", "aux"], capture_output=True, text=True, timeout=3
        )
        items = []
        for line in result.stdout.split("\n")[1:]:
            if query.lower() in line.lower():
                parts = line.split()
                if len(parts) >= 11:
                    items.append({
                        "name": parts[10][:50],
                        "pid": parts[1],
                        "cpu": parts[2],
                        "mem": parts[3],
                    })
        return items
    except:
        return []


def _search_services(query: str) -> list:
    try:
        result = subprocess.run(
            ["systemctl", "list-units", "--type=service", "--no-pager", "--no-legend"],
            capture_output=True, text=True, timeout=5
        )
        items = []
        for line in result.stdout.split("\n"):
            if query.lower() in line.lower():
                parts = line.split()
                if len(parts) >= 2:
                    items.append({
                        "name": parts[0],
                        "status": parts[2] if len(parts) > 2 else "?",
                    })
        return items
    except:
        return []


def _search_packages(query: str) -> list:
    try:
        result = subprocess.run(
            ["pacman", "-Qs", query], capture_output=True, text=True, timeout=10
        )
        items = []
        for line in result.stdout.split("\n"):
            if "/" in line:
                m = re.match(r"(\S+)/(\S+)\s+(.+)$", line.strip())
                if m:
                    items.append({
                        "repo": m.group(1),
                        "name": m.group(2),
                        "version": m.group(3).split()[0] if m.group(3) else "",
                    })
        return items
    except:
        return []


@router.get("/search")
def search(
    q: str = Query("", description="Arama sorgusu"),
    type: str = Query("web", description="Arama türü: web, local, system"),
    page: int = Query(1, ge=1, description="Sayfa numarası"),
):
    if not q.strip():
        return {"error": "Arama sorgusu gerekli", "results": [], "query": q}

    if type == "web":
        return _search_web(q, page)
    elif type == "local":
        return _search_local(q)
    elif type == "system":
        return _search_system(q)
    else:
        return {"error": "Geçersiz arama türü", "results": []}


@router.get("/search/suggest")
def suggest(q: str = Query("", description="Tamamlama sorgusu")):
    if not q.strip():
        return {"suggestions": []}
    try:
        params = {"q": q, "format": "json"}
        resp = httpx.get(
            "https://duckduckgo.com/ac/",
            params=params,
            timeout=5,
        )
        data = resp.json()
        suggestions = [item.get("phrase", "") for item in data if isinstance(item, dict)]
        return {"suggestions": suggestions[:8]}
    except:
        return {"suggestions": []}


@router.get("/proxy")
def proxy(url: str = Query("", description="Getirilecek URL")):
    if not url.strip():
        return {"error": "URL gerekli"}
    try:
        resp = httpx.get(url, timeout=15, follow_redirects=True)
        content_type = resp.headers.get("content-type", "").lower()
        if "text/html" in content_type or "text/plain" in content_type:
            return {"content": resp.text, "url": url, "content_type": content_type}
        return {"error": "Desteklenmeyen icerik turu", "content_type": content_type}
    except Exception as e:
        return {"error": f"Sayfa yuklenemedi: {str(e)}"}
