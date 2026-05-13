import os
import pty
import fcntl
import struct
import termios
import asyncio
import signal
from urllib.parse import parse_qs
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from dependencies import require_auth
from auth import verify_token

router = APIRouter(tags=["terminal"])

@router.websocket("/terminal")
async def terminal(websocket: WebSocket, token: str = Query("")):
    token = token or parse_qs(websocket.url.query).get("token", [None])[0]
    if not token:
        await websocket.close(code=4001, reason="Token gerekli")
        return
    try:
        verify_token(token)
    except Exception:
        await websocket.close(code=4001, reason="Geçersiz token")
        return

    await websocket.accept()

    master_fd, slave_fd = pty.openpty()

    pid = os.fork()
    if pid == 0:
        os.close(master_fd)
        os.setsid()
        os.dup2(slave_fd, 0)
        os.dup2(slave_fd, 1)
        os.dup2(slave_fd, 2)
        if slave_fd > 2:
            os.close(slave_fd)
        os.environ["TERM"] = "xterm-256color"
        shell = os.environ.get("SHELL", "/bin/bash")
        os.execve(shell, [shell], os.environ)

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
                await websocket.send_text(data.decode("utf-8", errors="replace"))
            except (OSError, ValueError):
                await asyncio.sleep(0.01)
                continue
            except WebSocketDisconnect:
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
            except WebSocketDisconnect:
                break

    try:
        await asyncio.gather(reader(), writer())
    finally:
        try:
            os.close(master_fd)
        except OSError:
            pass
        try:
            os.kill(pid, signal.SIGHUP)
        except OSError:
            pass
