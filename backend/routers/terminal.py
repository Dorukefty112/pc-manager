import os
import re
import pty
import shutil
import subprocess
import json
import time
import fcntl
import struct
import secrets
import termios
import asyncio
import signal
import threading
from pathlib import Path
from urllib.parse import parse_qs
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from dependencies import require_auth, verify_ws_token

router = APIRouter(tags=["terminal"])

CONFIG_PATH = Path(__file__).parent.parent / "config.json"
RECORDINGS_DIR = Path(__file__).parent.parent / "terminal_logs"
RECORDINGS_INDEX = RECORDINGS_DIR / "index.json"
MAX_RECORDING_BYTES = 5 * 1024 * 1024
MAX_RECORDINGS = 50
SSH_TARGET_RE = re.compile(r"^[A-Za-z0-9_.-]+@?[A-Za-z0-9_.:-]*$")

_index_lock = threading.Lock()


def _load_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return {}


def _recording_enabled() -> bool:
    return _load_config().get("terminal", {}).get("record", True)


def _load_index() -> list[dict]:
    if RECORDINGS_INDEX.exists():
        try:
            return json.loads(RECORDINGS_INDEX.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return []


def _save_index(items: list[dict]):
    RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
    RECORDINGS_INDEX.write_text(json.dumps(items, indent=2, ensure_ascii=False))


def _update_index(rec_id: str, **fields):
    with _index_lock:
        items = _load_index()
        for item in items:
            if item["id"] == rec_id:
                item.update(fields)
                break
        else:
            items.insert(0, {"id": rec_id, **fields})
        for old in items[MAX_RECORDINGS:]:
            (RECORDINGS_DIR / f"{old['id']}.log").unlink(missing_ok=True)
        _save_index(items[:MAX_RECORDINGS])


class Recorder:
    def __init__(self, username: str, label: str):
        RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
        try:
            os.chmod(RECORDINGS_DIR, 0o700)
        except OSError:
            pass
        self.id = time.strftime("%Y%m%d-%H%M%S-") + secrets.token_hex(3)
        self.size = 0
        self.truncated = False
        self.fh = open(RECORDINGS_DIR / f"{self.id}.log", "wb")
        _update_index(self.id, username=username, label=label,
                      started=int(time.time()), ended=None, size=0)

    def write(self, data: bytes):
        if self.truncated:
            return
        room = MAX_RECORDING_BYTES - self.size
        if len(data) > room:
            data = data[:room]
            self.truncated = True
        self.fh.write(data)
        self.size += len(data)

    def close(self):
        try:
            self.fh.close()
        finally:
            _update_index(self.id, ended=int(time.time()), size=self.size, truncated=self.truncated)


async def run_pty(websocket: WebSocket, argv: list[str], recorder: Recorder | None = None, env: dict | None = None):
    """argv'yi bir PTY içinde çalıştırıp websocket ile iki yönlü bağlar."""
    master_fd, slave_fd = pty.openpty()
    child_env = {**os.environ, "TERM": "xterm-256color", **(env or {})}
    # Çok thread'li bir süreçte os.fork() güvenli değildir; Popen (fork+exec C
    # tarafında yapılır) ve PTY'yi kontrol terminali yapan `setsid -c` kullanılır.
    setsid = shutil.which("setsid")
    try:
        proc = subprocess.Popen(
            [setsid, "-c", *argv] if setsid else argv,
            stdin=slave_fd, stdout=slave_fd, stderr=slave_fd,
            env=child_env, close_fds=True, start_new_session=not setsid,
        )
    except OSError as e:
        os.close(master_fd)
        os.close(slave_fd)
        await websocket.send_text(f"\r\nBaşlatılamadı: {e}\r\n")
        await websocket.close()
        return
    os.close(slave_fd)

    fl = fcntl.fcntl(master_fd, fcntl.F_GETFL)
    fcntl.fcntl(master_fd, fcntl.F_SETFL, fl | os.O_NONBLOCK)

    def set_size(rows, cols):
        try:
            fcntl.ioctl(master_fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
        except OSError:
            pass

    async def reader():
        loop = asyncio.get_event_loop()
        while True:
            try:
                data = await loop.run_in_executor(None, os.read, master_fd, 4096)
                if not data:
                    break
                if recorder:
                    recorder.write(data)
                await websocket.send_text(data.decode("utf-8", errors="replace"))
            except BlockingIOError:
                await asyncio.sleep(0.01)
                continue
            except (OSError, ValueError):
                # Çocuk süreç çıktığında master_fd EIO verir
                if proc.poll() is not None:
                    break
                await asyncio.sleep(0.01)
                continue
            except (WebSocketDisconnect, RuntimeError):
                break

    async def writer():
        while True:
            try:
                data = await websocket.receive_text()
                if data.startswith("__RESIZE__"):
                    parts = data.split(":")
                    if len(parts) == 3:
                        set_size(int(parts[1]), int(parts[2]))
                    continue
                os.write(master_fd, data.encode("utf-8"))
            except (OSError, BlockingIOError):
                await asyncio.sleep(0.01)
                continue
            except (WebSocketDisconnect, RuntimeError):
                break

    tasks = [asyncio.ensure_future(reader()), asyncio.ensure_future(writer())]
    try:
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    finally:
        for t in tasks:
            t.cancel()
        try:
            os.close(master_fd)
        except OSError:
            pass
        if proc.poll() is None:
            try:
                os.killpg(proc.pid, signal.SIGHUP)
            except OSError:
                proc.send_signal(signal.SIGHUP)
        threading.Thread(target=_reap, args=(proc,), daemon=True).start()
        if recorder:
            recorder.close()
        try:
            await websocket.close()
        except Exception:
            pass


def _reap(proc: subprocess.Popen):
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()


def _ssh_argv(host_id: str) -> tuple[list[str], str] | None:
    for h in _load_config().get("remote_hosts", []):
        if h.get("id") == host_id and h.get("ssh"):
            target = h["ssh"].strip()
            if not SSH_TARGET_RE.match(target) or target.startswith("-"):
                return None
            argv = ["ssh", "-t"]
            if h.get("ssh_port"):
                argv += ["-p", str(int(h["ssh_port"]))]
            return argv + ["--", target], f"ssh {target}"
    return None


async def authorize_ws(websocket: WebSocket, token: str, admin: bool = True) -> dict | None:
    token = token or parse_qs(websocket.url.query).get("token", [None])[0]
    if not token:
        await websocket.close(code=4001, reason="Token gerekli")
        return None
    payload = verify_ws_token(token, admin=admin)
    if not payload:
        await websocket.close(code=4001, reason="Geçersiz token veya yetki yok")
        return None
    return payload


@router.websocket("/terminal")
async def terminal(websocket: WebSocket, token: str = Query(""), host: str = Query("")):
    payload = await authorize_ws(websocket, token)
    if not payload:
        return

    if host:
        resolved = _ssh_argv(host)
        if not resolved:
            await websocket.close(code=4004, reason="SSH hedefi bulunamadı")
            return
        argv, label = resolved
    else:
        shell = os.environ.get("SHELL", "/bin/bash")
        argv, label = [shell], shell

    await websocket.accept()
    recorder = Recorder(payload.get("username", "?"), label) if _recording_enabled() else None
    await run_pty(websocket, argv, recorder)


@router.get("/terminal/recordings")
def list_recordings(_: dict = Depends(require_auth)):
    return _load_index()


def _recording_path(rec_id: str) -> Path:
    if not re.fullmatch(r"[0-9]{8}-[0-9]{6}-[0-9a-f]{6}", rec_id):
        raise HTTPException(400, "Geçersiz kayıt kimliği")
    p = RECORDINGS_DIR / f"{rec_id}.log"
    if not p.exists():
        raise HTTPException(404, "Kayıt bulunamadı")
    return p


@router.get("/terminal/recordings/{rec_id}")
def get_recording(rec_id: str, _: dict = Depends(require_auth)):
    data = _recording_path(rec_id).read_bytes()
    return PlainTextResponse(data.decode("utf-8", errors="replace"))


@router.delete("/terminal/recordings/{rec_id}")
def delete_recording(rec_id: str, _: dict = Depends(require_auth)):
    _recording_path(rec_id).unlink(missing_ok=True)
    with _index_lock:
        _save_index([i for i in _load_index() if i["id"] != rec_id])
    return {"success": True}
