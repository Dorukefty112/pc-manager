import json
import time
import threading
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

router = APIRouter(tags=["speedtest"])

_state_lock = threading.Lock()

_results = {
    "status": "idle",
    "results": None,
    "error": None,
    "progress": "",
    "live": {"phase": "", "download": 0, "upload": 0, "ping": 0}
}

def _set_state(**kw):
    with _state_lock:
        d = dict(_results)
        d.update(kw)
        globals()["_results"] = d

def _run_test():
    _set_state(
        status="running", results=None, error=None,
        progress="Baslatiliyor...",
        live={"phase": "hazirlik", "download": 0, "upload": 0, "ping": 0}
    )

    try:
        import speedtest
        import datetime

        s = speedtest.Speedtest(secure=True)
        s.get_best_server()
        server = s.results.server

        ping = round(server.get("latency", 0), 1)
        isp = s.results.client.get("isp", "")
        ip = s.results.client.get("ip", "")
        server_name = server.get("name", "")
        server_host = server.get("host", "")

        parts = server_name.rsplit(" [", 1)
        if len(parts) > 1:
            name_clean, location = parts[0], parts[1].rstrip("]")
        else:
            name_clean, location = server_name, ""

        orig_opener = s._opener
        orig_open = orig_opener.open

        # ============================
        # DOWNLOAD — parallel via speedtest, live tracking via response wrapper
        # ============================
        _set_state(
            progress="Indirme testi...",
            live={"phase": "indirme", "download": 0, "upload": 0, "ping": ping}
        )

        dl_tracker = {"bytes": 0, "lock": threading.Lock()}

        class _DLResp:
            __slots__ = ("_r",)
            def __init__(self, r): self._r = r
            def read(self, n=10240):
                chunk = self._r.read(n)
                with dl_tracker["lock"]:
                    dl_tracker["bytes"] += len(chunk)
                return chunk
            def close(self): self._r.close()

        def _dl_open(req):
            return _DLResp(orig_open(req))

        s._opener = type("_DL", (), {"open": staticmethod(_dl_open)})()

        dl_start = time.monotonic()
        dl_thread = threading.Thread(target=s.download, daemon=True)
        dl_thread.start()

        while dl_thread.is_alive():
            with dl_tracker["lock"]:
                b = dl_tracker["bytes"]
            elapsed = time.monotonic() - dl_start
            if elapsed > 0 and b > 10000:
                speed = round((b * 8) / elapsed / 1_000_000, 1)
                _set_state(
                    live={"phase": "indirme", "download": speed, "upload": 0, "ping": ping},
                    progress=f"Indirme: {speed:.0f} Mbps"
                )
            time.sleep(0.25)

        dl_thread.join()
        download_speed = s.results.download / 1_000_000
        total_dl = int(s.results.bytes_received)

        # ============================
        # UPLOAD — parallel via speedtest, live tracking via HTTPUploaderData read wrapper
        # ============================
        s._opener = orig_opener

        _set_state(
            progress="Yukleme testi...",
            live={"phase": "yukleme", "download": round(download_speed, 1),
                  "upload": 0, "ping": ping}
        )

        ul_tracker = {"bytes": 0, "lock": threading.Lock()}
        _orig_data_read = speedtest.HTTPUploaderData.read

        def _tracked_data_read(self, n=10240):
            chunk = _orig_data_read(self, n)
            with ul_tracker["lock"]:
                ul_tracker["bytes"] += len(chunk)
            return chunk

        speedtest.HTTPUploaderData.read = _tracked_data_read

        ul_start = time.monotonic()
        ul_thread = threading.Thread(target=s.upload, daemon=True)
        ul_thread.start()

        while ul_thread.is_alive():
            with ul_tracker["lock"]:
                b = ul_tracker["bytes"]
            elapsed = time.monotonic() - ul_start
            if elapsed > 0 and b > 10000:
                speed = round((b * 8) / elapsed / 1_000_000, 1)
                _set_state(
                    live={"phase": "yukleme",
                          "download": round(download_speed, 1),
                          "upload": speed, "ping": ping},
                    progress=f"Yukleme: {speed:.0f} Mbps"
                )
            time.sleep(0.25)

        ul_thread.join()
        speedtest.HTTPUploaderData.read = _orig_data_read
        upload_speed = s.results.upload / 1_000_000
        total_ul = int(s.results.bytes_sent)

        # ============================
        # RESULT
        # ============================
        timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()

        result = {
            "isp": isp,
            "ip": ip,
            "server_name": name_clean,
            "server_location": location,
            "server_host": server_host,
            "ping": ping,
            "download": round(download_speed, 2),
            "upload": round(upload_speed, 2),
            "download_bytes": total_dl,
            "upload_bytes": total_ul,
            "timestamp": timestamp,
        }

        _set_state(status="done", results=result, progress="", live=None)

        hist_file = Path(__file__).parent.parent / "speedtest_history.json"
        try:
            history = json.loads(hist_file.read_text())
        except Exception:
            history = []
        history.append(result)
        hist_file.write_text(json.dumps(history[-100:], indent=2, ensure_ascii=False))

    except Exception as e:
        import traceback
        _set_state(status="error", error=str(e)[:300], live=None)


@router.post("/speedtest/start")
def start_speedtest():
    if _results.get("status") == "running":
        raise HTTPException(400, "Zaten bir test calisiyor")
    thread = threading.Thread(target=_run_test, daemon=True)
    thread.start()
    return {"status": "started"}


@router.get("/speedtest/status")
def get_speedtest_status():
    with _state_lock:
        return JSONResponse(dict(_results))


@router.get("/speedtest/history")
def get_speedtest_history():
    hist_file = Path(__file__).parent.parent / "speedtest_history.json"
    if not hist_file.exists():
        return {"history": []}
    try:
        history = json.loads(hist_file.read_text())
        return {"history": history[-20:]}
    except Exception:
        return {"history": []}
