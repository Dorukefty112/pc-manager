import os
import re
import subprocess
from pathlib import Path
from fastapi import APIRouter, Query, HTTPException
import httpx
from urllib.parse import urlparse

router = APIRouter(tags=["search"])

READER_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)


def _domain(url: str) -> str:
    try:
        return urlparse(url).netloc
    except:
        return ""


def _favicon(url: str) -> str:
    domain = _domain(url)
    if domain:
        return f"https://icons.duckduckgo.com/ip3/{domain}.ico"
    return ""


def _search_web(query: str, page: int = 1) -> dict:
    try:
        from ddgs import DDGS
        ddgs = DDGS(timeout=10)
        raw = list(ddgs.text(query, max_results=30))
        results = []
        seen = set()
        for r in raw:
            url = r.get("href", "")
            d = _domain(url)
            key = url.lower().rstrip("/")
            if key in seen:
                continue
            seen.add(key)
            results.append({
                "title": r.get("title", "").strip(),
                "url": url,
                "domain": d,
                "favicon": _favicon(url),
                "snippet": r.get("body", "").strip(),
            })
        start = (page - 1) * 10
        paged = results[start:start + 10]
        return {"results": paged, "total": len(results), "page": page, "query": query}
    except ImportError:
        return {"error": "ddgs kutuphanesi eksik", "results": [], "query": query}
    except Exception as e:
        return {"error": f"Arama hatasi: {str(e)}", "results": [], "query": query}


def _search_local(query: str) -> dict:
    results = []
    try:
        home = os.path.expanduser("~")
    except:
        home = "/tmp"

    if not os.path.isdir(home):
        return {"results": [], "total": 0, "query": query}

    try:
        result = subprocess.run(
            ["grep", "-r", "-l", "-i", query, home, "--include=*.txt", "--include=*.md",
             "--include=*.py", "--include=*.js", "--include=*.json",
             "--include=*.yml", "--include=*.yaml", "--include=*.conf",
             "--include=*.cfg", "--include=*.log", "-m", "5"],
            capture_output=True, text=True, timeout=5
        )
        for line in result.stdout.strip().split("\n")[:30]:
            line = line.strip()
            if not line:
                continue
            try:
                content = Path(line).read_text(encoding="utf-8", errors="replace")[:500]
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
        result = subprocess.run(["ps", "aux"], capture_output=True, text=True, timeout=3)
        items = []
        for line in result.stdout.split("\n")[1:]:
            if query.lower() in line.lower():
                parts = line.split()
                if len(parts) >= 11:
                    items.append({"name": parts[10][:50], "pid": parts[1], "cpu": parts[2], "mem": parts[3]})
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
                    items.append({"name": parts[0], "status": parts[2] if len(parts) > 2 else "?"})
        return items
    except:
        return []


def _search_packages(query: str) -> list:
    try:
        result = subprocess.run(["pacman", "-Qs", query], capture_output=True, text=True, timeout=10)
        items = []
        for line in result.stdout.split("\n"):
            if "/" in line:
                m = re.match(r"(\S+)/(\S+)\s+(.+)$", line.strip())
                if m:
                    items.append({"repo": m.group(1), "name": m.group(2), "version": m.group(3).split()[0] if m.group(3) else ""})
        return items
    except:
        return []


@router.get("/search")
def search(
    q: str = Query("", description="Arama sorgusu"),
    type: str = Query("web", description="web, local, system"),
    page: int = 1,
):
    page = max(1, page)
    if not q.strip():
        return {"error": "Arama sorgusu gerekli", "results": [], "query": q}
    if type == "web":
        return _search_web(q, page)
    elif type == "local":
        return _search_local(q)
    elif type == "system":
        return _search_system(q)
    return {"error": "Geçersiz arama türü", "results": []}


@router.get("/search/suggest")
def suggest(q: str = Query("", description="Tamamlama sorgusu")):
    if not q.strip():
        return {"suggestions": []}
    try:
        params = {"q": q, "format": "json"}
        resp = httpx.get("https://duckduckgo.com/ac/", params=params, timeout=5)
        data = resp.json()
        suggestions = [item.get("phrase", "") for item in data if isinstance(item, dict)]
        return {"suggestions": suggestions[:8]}
    except:
        return {"suggestions": []}


@router.get("/reader")
def reader(url: str = Query("", description="Okunacak URL")):
    if not url.strip():
        raise HTTPException(400, "URL gerekli")

    domain = _domain(url)
    if not domain:
        return {"title": "", "content": "", "url": url, "error": "Geçersiz URL"}

    try:
        resp = httpx.get(
            url,
            timeout=15,
            follow_redirects=True,
            headers={
                "User-Agent": READER_USER_AGENT,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
            },
        )
        content_type = resp.headers.get("content-type", "").lower()
        if "text/html" not in content_type and "application/xhtml" not in content_type:
            return {"title": "", "content": "", "url": url, "error": "HTML sayfa değil"}

        from bs4 import BeautifulSoup
        soup = BeautifulSoup(resp.text, "lxml")

        for tag in soup(["script", "style", "nav", "footer", "header", "aside", "noscript", "iframe", "form", "svg"]):
            tag.decompose()

        title_tag = soup.find("title")
        title = title_tag.get_text(strip=True) if title_tag else domain

        body = soup.find("body") or soup
        content_parts = []

        for el in body.find_all(["p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote", "pre", "img"]):
            text = el.get_text(strip=True)
            if el.name == "img":
                src = el.get("src", "") or el.get("data-src", "")
                if src and not src.startswith("data:"):
                    if src.startswith("//"):
                        src = "https:" + src
                    elif src.startswith("/"):
                        parsed = urlparse(url)
                        src = f"{parsed.scheme}://{parsed.netloc}{src}"
                    content_parts.append(f'<img src="{src}" alt="{el.get("alt", "")}"/>')
            elif text and len(text) > 10:
                tag = el.name
                content_parts.append(f"<{tag}>{text}</{tag}>" if tag.startswith("h") else f"<p>{text}</p>")

        content = "\n".join(content_parts[:200])
        return {"title": title, "content": content, "url": url, "domain": domain}
    except httpx.TimeoutException:
        return {"title": "", "content": "", "url": url, "error": "Sayfa zaman aşımına uğradı"}
    except Exception as e:
        return {"title": "", "content": "", "url": url, "error": f"Okunamadı: {str(e)[:100]}"}


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


def _rewrite_html(html: str, base_url: str) -> str:
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "lxml")
    if soup.head:
        existing = soup.head.find("base")
        if not existing:
            tag = soup.new_tag("base", href=base_url)
            soup.head.insert(0, tag)
    for attr in ("src", "href", "action", "data-src", "srcset"):
        for el in soup.find_all(attrs={attr: True}):
            val = el.get(attr, "")
            if val.startswith("//"):
                el[attr] = "https:" + val
            elif val.startswith("/") and not val.startswith("//"):
                parsed = urlparse(base_url)
                el[attr] = f"{parsed.scheme}://{parsed.netloc}{val}"
    return str(soup)


def _fetch_page(url: str):
    resp = httpx.get(
        url,
        timeout=20,
        follow_redirects=True,
        headers={
            "User-Agent": READER_USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
        },
    )
    return resp
