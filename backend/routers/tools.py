import os
import re
import json
import time
import shutil
import subprocess
from typing import Any, Callable

import psutil


def _fmt_bytes(b):
    if b > 1e12: return f"{b/1e12:.2f} TB"
    if b > 1e9: return f"{b/1e9:.2f} GB"
    if b > 1e6: return f"{b/1e6:.2f} MB"
    if b > 1e3: return f"{b/1e3:.1f} KB"
    return f"{b} B"


def _human_time(secs):
    if secs < 60: return f"{secs:.0f}s"
    if secs < 3600: return f"{secs/60:.0f}d {secs%60:.0f}s"
    days = int(secs // 86400)
    hours = int((secs % 86400) // 3600)
    mins = int((secs % 3600) // 60)
    if days: return f"{days}g {hours}s {mins}d"
    return f"{hours}s {mins}d"


def tool_get_cpu(params: dict) -> str:
    pct = psutil.cpu_percent(interval=0.3)
    logical = psutil.cpu_count()
    physical = psutil.cpu_count(logical=False) or logical
    freq = psutil.cpu_freq()
    load = psutil.getloadavg()
    return json.dumps({
        "percent": round(pct, 1),
        "physical_cores": physical,
        "logical_cores": logical,
        "freq_mhz": round(freq.current) if freq else 0,
        "freq_max_mhz": round(freq.max) if freq else 0,
        "load_1min": round(load[0], 2),
        "load_5min": round(load[1], 2),
        "load_15min": round(load[2], 2),
    }, ensure_ascii=False)


def tool_get_memory(params: dict) -> str:
    mem = psutil.virtual_memory()
    swap = psutil.swap_memory()
    return json.dumps({
        "total": _fmt_bytes(mem.total),
        "used": _fmt_bytes(mem.used),
        "available": _fmt_bytes(mem.available),
        "percent": round(mem.percent, 1),
        "swap_total": _fmt_bytes(swap.total),
        "swap_used": _fmt_bytes(swap.used),
        "swap_percent": round(swap.percent, 1),
    }, ensure_ascii=False)


def tool_get_disk(params: dict) -> str:
    parts = []
    for dp in psutil.disk_partitions():
        try:
            u = psutil.disk_usage(dp.mountpoint)
            parts.append({
                "device": dp.device,
                "mount": dp.mountpoint,
                "fstype": dp.fstype,
                "total": _fmt_bytes(u.total),
                "used": _fmt_bytes(u.used),
                "free": _fmt_bytes(u.free),
                "percent": round(u.percent, 1),
            })
        except:
            pass
    return json.dumps(parts, ensure_ascii=False)


def tool_get_processes(params: dict) -> str:
    sort_by = params.get("sort", "cpu")
    limit = min(params.get("limit", 10), 50)
    procs = []
    for p in psutil.process_iter(["pid", "name", "cpu_percent", "memory_percent", "status", "username"]):
        try:
            info = p.info
            info["cpu_percent"] = info["cpu_percent"] or 0
            info["memory_percent"] = info["memory_percent"] or 0
            procs.append(info)
        except:
            pass
    reverse = True
    if sort_by == "pid":
        reverse = False
    procs.sort(key=lambda x: x.get(sort_by, 0) or 0, reverse=reverse)
    procs = procs[:limit]
    return json.dumps([{
        "pid": p["pid"], "name": p["name"],
        "cpu": round(p["cpu_percent"], 1),
        "memory": round(p["memory_percent"], 1),
        "status": p.get("status", "?"),
        "user": p.get("username", "?"),
    } for p in procs], ensure_ascii=False)


def tool_kill_process(params: dict) -> str:
    pid = params.get("pid")
    try:
        p = psutil.Process(pid)
        name = p.name()
        p.terminate()
        return json.dumps({"success": True, "pid": pid, "name": name, "message": f"Process {name} ({pid}) sonlandirildi."}, ensure_ascii=False)
    except psutil.NoSuchProcess:
        return json.dumps({"success": False, "error": f"PID {pid} bulunamadi."}, ensure_ascii=False)
    except psutil.AccessDenied:
        return json.dumps({"success": False, "error": f"PID {pid} sonlandirma yetkisi yok."}, ensure_ascii=False)


def tool_get_services(params: dict) -> str:
    try:
        result = subprocess.run(
            ["systemctl", "list-units", "--type=service", "--no-pager", "--no-legend", "--all"],
            capture_output=True, text=True, timeout=5
        )
        services = []
        for line in result.stdout.strip().split("\n"):
            parts = line.split()
            if len(parts) >= 3:
                services.append({"name": parts[0], "status": parts[2], "desc": " ".join(parts[3:])})
        return json.dumps(services[:30], ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


def tool_manage_service(params: dict) -> str:
    name = params.get("name", "")
    action = params.get("action", "status")
    try:
        result = subprocess.run(
            ["systemctl", action, name, "--no-pager"],
            capture_output=True, text=True, timeout=10
        )
        return json.dumps({
            "success": result.returncode == 0,
            "output": (result.stdout or result.stderr).strip()[:500],
        }, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)}, ensure_ascii=False)


def tool_get_network(params: dict) -> str:
    net = psutil.net_io_counters()
    ifaces = []
    for name, addrs in psutil.net_if_addrs().items():
        ips = [a.address for a in addrs if a.family == 2]
        macs = [a.address for a in addrs if a.family == 17]
        if ips or macs:
            ifaces.append({
                "name": name,
                "ip": ips[0] if ips else None,
                "mac": macs[0] if macs else None,
            })
    stats = psutil.net_if_stats()
    for iface in ifaces:
        s = stats.get(iface["name"])
        if s:
            iface["up"] = s.isup
            iface["speed"] = s.speed
    return json.dumps({
        "interfaces": ifaces,
        "bytes_sent": _fmt_bytes(net.bytes_sent),
        "bytes_recv": _fmt_bytes(net.bytes_recv),
        "packets_sent": net.packets_sent,
        "packets_recv": net.packets_recv,
    }, ensure_ascii=False)


def tool_list_files(params: dict) -> str:
    path = params.get("path", os.path.expanduser("~"))
    try:
        entries = []
        for entry in os.scandir(path):
            try:
                st = entry.stat()
                entries.append({
                    "name": entry.name,
                    "type": "dir" if entry.is_dir() else "file",
                    "size": _fmt_bytes(st.st_size),
                    "modified": time.strftime("%Y-%m-%d %H:%M", time.localtime(st.st_mtime)),
                })
            except:
                pass
        entries.sort(key=lambda e: (e["type"] != "dir", e["name"].lower()))
        return json.dumps(entries[:50], ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


def tool_read_file(params: dict) -> str:
    path = params.get("path", "")
    try:
        with open(path, "r") as f:
            content = f.read(5000)
        return json.dumps({"path": path, "content": content, "truncated": len(content) >= 5000}, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


def tool_write_file(params: dict) -> str:
    path = params.get("path", "")
    content = params.get("content", "")
    try:
        with open(path, "w") as f:
            f.write(content)
        return json.dumps({"success": True, "path": path, "bytes": len(content)}, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


def tool_exec_command(params: dict) -> str:
    cmd = params.get("command", "")
    timeout = min(params.get("timeout", 10), 30)
    if not cmd:
        return json.dumps({"error": "komut gerekli"}, ensure_ascii=False)
    try:
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True, timeout=timeout,
        )
        out = (result.stdout or "")[:4000]
        err = (result.stderr or "")[:1000]
        return json.dumps({
            "exit_code": result.returncode,
            "stdout": out,
            "stderr": err,
        }, ensure_ascii=False)
    except subprocess.TimeoutExpired:
        return json.dumps({"error": f"komut {timeout}s icinde tamamlanamadi"}, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


def tool_get_temperature(params: dict) -> str:
    temps = []
    try:
        for name, entries in psutil.sensors_temperatures().items():
            for entry in entries:
                temps.append({
                    "sensor": entry.label or name,
                    "current": entry.current,
                    "high": entry.high if entry.high else None,
                    "critical": entry.critical if entry.critical else None,
                })
    except:
        pass
    if not temps:
        return json.dumps({"error": "sicaklik sensoru bulunamadi"}, ensure_ascii=False)
    return json.dumps(temps, ensure_ascii=False)


def tool_get_logs(params: dict) -> str:
    lines = min(params.get("lines", 15), 50)
    try:
        result = subprocess.run(
            ["journalctl", "-n", str(lines), "--no-pager", "-o", "short-iso"],
            capture_output=True, text=True, timeout=5
        )
        log_lines = [l for l in result.stdout.strip().split("\n") if l.strip()]
        return json.dumps({"logs": log_lines}, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


def tool_get_deprem(params: dict) -> str:
    from .deprem import fetch_kandilli, fetch_afad
    try:
        depremler = fetch_kandilli()
        if not depremler:
            depremler = fetch_afad()
        if not depremler:
            return json.dumps({"error": "deprem verisi alinamadi (Kandilli ve AFAD kullanilamiyor)"}, ensure_ascii=False)
        depremler.sort(key=lambda d: d.datetime, reverse=True)
        return json.dumps([d.to_dict() for d in depremler[:5]], ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": f"deprem verisi alinamadi: {str(e)}"}, ensure_ascii=False)


def tool_web_search(params: dict) -> str:
    query = params.get("query", "")
    if not query:
        return json.dumps({"error": "arama sorgusu gerekli"}, ensure_ascii=False)
    from .search_engine import _search_web
    try:
        result = _search_web(query)
        if result.get("error"):
            return json.dumps({"error": result["error"]}, ensure_ascii=False)
        if not result.get("results"):
            return json.dumps({"message": "Sonuc bulunamadi", "query": query}, ensure_ascii=False)
        return json.dumps({
            "query": query,
            "total": result["total"],
            "results": result["results"][:5],
        }, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": f"web aramasi basarisiz: {str(e)}"}, ensure_ascii=False)


def tool_web_fetch(params: dict) -> str:
    url = params.get("url", "")
    if not url:
        return json.dumps({"error": "URL gerekli"}, ensure_ascii=False)
    try:
        import httpx
        resp = httpx.get(url, timeout=8, follow_redirects=True)
        content_type = resp.headers.get("content-type", "").lower()
        text = resp.text[:10000]
        return json.dumps({
            "url": url,
            "content_type": content_type,
            "content": text,
            "truncated": len(resp.text) > 10000,
        }, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": f"sayfa yuklenemedi: {str(e)}"}, ensure_ascii=False)


def tool_system_summary(params: dict) -> str:
    cpu = json.loads(tool_get_cpu({}))
    mem = json.loads(tool_get_memory({}))
    disk = json.loads(tool_get_disk({}))
    boot = psutil.boot_time()
    uptime_sec = time.time() - boot
    hostname = os.uname().nodename
    kernel = os.uname().release
    return json.dumps({
        "hostname": hostname,
        "kernel": kernel,
        "uptime": _human_time(uptime_sec),
        "boot_time": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(boot)),
        "cpu": cpu,
        "memory": mem,
        "disks": disk,
        "users": [u.name for u in psutil.users()],
    }, ensure_ascii=False)


TOOLS: dict[str, dict] = {
    "get_cpu": {
        "fn": tool_get_cpu,
        "spec": {
            "type": "function",
            "function": {
                "name": "get_cpu",
                "description": "CPU kullanim, cekirdek sayisi, frekans ve yuk bilgisi",
                "parameters": {"type": "object", "properties": {}, "required": []},
            },
        },
    },
    "get_memory": {
        "fn": tool_get_memory,
        "spec": {
            "type": "function",
            "function": {
                "name": "get_memory",
                "description": "RAM ve Swap kullanim detaylari",
                "parameters": {"type": "object", "properties": {}, "required": []},
            },
        },
    },
    "get_disk": {
        "fn": tool_get_disk,
        "spec": {
            "type": "function",
            "function": {
                "name": "get_disk",
                "description": "Tum disk bolumleri, kullanim ve doluluk oranlari",
                "parameters": {"type": "object", "properties": {}, "required": []},
            },
        },
    },
    "get_processes": {
        "fn": tool_get_processes,
        "spec": {
            "type": "function",
            "function": {
                "name": "get_processes",
                "description": "Calisan process'leri listele. CPU'ya gore siralamak icin sort='cpu', RAM icin sort='memory', PID icin sort='pid'",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "sort": {"type": "string", "enum": ["cpu", "memory", "pid"], "description": "siralama kriteri"},
                        "limit": {"type": "integer", "description": "kac adet (max 50)"},
                    },
                    "required": [],
                },
            },
        },
    },
    "kill_process": {
        "fn": tool_kill_process,
        "spec": {
            "type": "function",
            "function": {
                "name": "kill_process",
                "description": "PID ile process sonlandir",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "pid": {"type": "integer", "description": "sonlandirilacak process ID"},
                    },
                    "required": ["pid"],
                },
            },
        },
    },
    "get_services": {
        "fn": tool_get_services,
        "spec": {
            "type": "function",
            "function": {
                "name": "get_services",
                "description": "Systemd servislerinin listesi ve durumlari",
                "parameters": {"type": "object", "properties": {}, "required": []},
            },
        },
    },
    "manage_service": {
        "fn": tool_manage_service,
        "spec": {
            "type": "function",
            "function": {
                "name": "manage_service",
                "description": "Servis baslat/durdur/yeniden baslat/durum goruntule. Action: start, stop, restart, status",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "servis adi (orn: nginx.service)"},
                        "action": {"type": "string", "enum": ["start", "stop", "restart", "status"], "description": "yapilacak islem"},
                    },
                    "required": ["name", "action"],
                },
            },
        },
    },
    "get_network": {
        "fn": tool_get_network,
        "spec": {
            "type": "function",
            "function": {
                "name": "get_network",
                "description": "Ag arayuzleri, IP adresleri, trafik istatistikleri",
                "parameters": {"type": "object", "properties": {}, "required": []},
            },
        },
    },
    "exec_command": {
        "fn": tool_exec_command,
        "spec": {
            "type": "function",
            "function": {
                "name": "exec_command",
                "description": "Shell komutu calistir. Orn: ls -la, df -h, free -h, ping -c 3 google.com",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": {"type": "string", "description": "calistirilacak shell komutu"},
                        "timeout": {"type": "integer", "description": "maksimum bekleme suresi (saniye)"},
                    },
                    "required": ["command"],
                },
            },
        },
    },
    "get_temperature": {
        "fn": tool_get_temperature,
        "spec": {
            "type": "function",
            "function": {
                "name": "get_temperature",
                "description": "CPU ve sistem sicaklik sensor degerleri",
                "parameters": {"type": "object", "properties": {}, "required": []},
            },
        },
    },
    "get_logs": {
        "fn": tool_get_logs,
        "spec": {
            "type": "function",
            "function": {
                "name": "get_logs",
                "description": "Son sistem log kayitlari (journalctl)",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "lines": {"type": "integer", "description": "kac satir (max 50)"},
                    },
                    "required": [],
                },
            },
        },
    },
    "list_files": {
        "fn": tool_list_files,
        "spec": {
            "type": "function",
            "function": {
                "name": "list_files",
                "description": "Belirtilen dizindeki dosyalari listele",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "dizin yolu (ornek: /home/kullanici veya /etc)"},
                    },
                    "required": [],
                },
            },
        },
    },
    "read_file": {
        "fn": tool_read_file,
        "spec": {
            "type": "function",
            "function": {
                "name": "read_file",
                "description": "Bir dosyanin icerigini oku (max 5000 karakter)",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "dosya yolu"},
                    },
                    "required": ["path"],
                },
            },
        },
    },
    "write_file": {
        "fn": tool_write_file,
        "spec": {
            "type": "function",
            "function": {
                "name": "write_file",
                "description": "Dosyaya yaz veya varolan dosyayi guncelle",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "dosya yolu"},
                        "content": {"type": "string", "description": "dosya icerigi"},
                    },
                    "required": ["path", "content"],
                },
            },
        },
    },
    "get_deprem": {
        "fn": tool_get_deprem,
        "spec": {
            "type": "function",
            "function": {
                "name": "get_deprem",
                "description": "Son deprem verilerini getir (Kandilli Rasathanesi)",
                "parameters": {"type": "object", "properties": {}, "required": []},
            },
        },
    },
    "web_search": {
        "fn": tool_web_search,
        "spec": {
            "type": "function",
            "function": {
                "name": "web_search",
                "description": "Web'de arama yap (DuckDuckGo). Guncel bilgi, haber, dokuman, kod ornegi vb. icin kullan.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "aranacak sorgu (Turkce veya Ingilizce)"},
                    },
                    "required": ["query"],
                },
            },
        },
    },
    "web_fetch": {
        "fn": tool_web_fetch,
        "spec": {
            "type": "function",
            "function": {
                "name": "web_fetch",
                "description": "Belirtilen URL'deki sayfa icerigini getir. web_search ile bulunan linklerin detaylarini okumak icin kullan.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "url": {"type": "string", "description": "getirilecek sayfa URL'si"},
                    },
                    "required": ["url"],
                },
            },
        },
    },
    "system_summary": {
        "fn": tool_system_summary,
        "spec": {
            "type": "function",
            "function": {
                "name": "system_summary",
                "description": "Tek cagrida tum sistem ozeti: CPU, RAM, disk, uptime, hostname, kernel, kullanicilar",
                "parameters": {"type": "object", "properties": {}, "required": []},
            },
        },
    },
}


TOOL_SPECS = [t["spec"] for t in TOOLS.values()]


def execute_tool(name: str, args: dict) -> str:
    tool = TOOLS.get(name)
    if not tool:
        return json.dumps({"error": f"bilinmeyen tool: {name}"})
    try:
        return tool["fn"](args)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)
