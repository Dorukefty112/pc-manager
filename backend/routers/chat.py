import os
import re
import pty
import fcntl
import struct
import termios
import signal
import uuid
import time
import shutil
import subprocess
import psutil
from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["chat"])

_sessions = {}

def _new_session_id():
    return str(uuid.uuid4())[:8]

class ChatSession:
    def __init__(self):
        self.id = _new_session_id()
        self.created = time.time()
        self.history = []
        self.cwd = os.path.expanduser("~")
        self.master_fd = None
        self.slave_fd = None
        self.pid = None
        self._init_shell()

    def _init_shell(self):
        self.master_fd, self.slave_fd = pty.openpty()
        self.pid = os.fork()
        if self.pid == 0:
            os.close(self.master_fd)
            os.setsid()
            os.dup2(self.slave_fd, 0)
            os.dup2(self.slave_fd, 1)
            os.dup2(self.slave_fd, 2)
            if self.slave_fd > 2:
                os.close(self.slave_fd)
            os.environ["TERM"] = "xterm-256color"
            os.environ["PS1"] = ""
            shell = os.environ.get("SHELL", "/bin/bash")
            os.execve(shell, [shell], os.environ)
        os.close(self.slave_fd)
        fl = fcntl.fcntl(self.master_fd, fcntl.F_GETFL)
        fcntl.fcntl(self.master_fd, fcntl.F_SETFL, fl | os.O_NONBLOCK)

    def _set_winsize(self, rows=80, cols=120):
        try:
            fcntl.ioctl(self.master_fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
        except: pass

    def _flush_output(self):
        out = ""
        while True:
            try:
                data = os.read(self.master_fd, 65536)
                if not data:
                    break
                out += data.decode("utf-8", errors="replace")
            except (OSError, BlockingIOError):
                break
        return out

    def exec_cmd(self, cmd):
        cmd_bytes = (cmd + "\n").encode("utf-8")
        os.write(self.master_fd, cmd_bytes)
        time.sleep(0.15)
        self._flush_output()
        time.sleep(0.2)
        output = self._flush_output()
        cleaned = self._clean_output(output)
        return cleaned

    def _clean_output(self, text):
        text = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', text)
        text = re.sub(r'\x1b\][0-9;]*[a-zA-Z]', '', text)
        text = re.sub(r'\x07', '', text)
        text = re.sub(r'\r\n', '\n', text)
        text = re.sub(r'\r', '\n', text)
        lines = [l for l in text.split('\n') if l.strip() and not any(l.strip().startswith(c) for c in ['echo', 'printf'])]
        return '\n'.join(lines).strip()

    def run_direct(self, cmd):
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10, cwd=self.cwd)
            out = (result.stdout or "") + (result.stderr or "")
            return out.strip()
        except:
            return None

    def close(self):
        if self.master_fd is not None:
            try: os.close(self.master_fd)
            except: pass
        if self.pid and self.pid > 0:
            try: os.kill(self.pid, signal.SIGHUP)
            except: pass
            try: os.kill(self.pid, signal.SIGKILL)
            except: pass
        if self.id in _sessions:
            del _sessions[self.id]

_intents = [
    (r'(merhaba|selam|hey|hello|hi)', 'merhaba'),
    (r'(cpu|işlemci|processor)', 'cpu'),
    (r'(ram|bellek|memory)', 'ram'),
    (r'(disk|harddisk|ssd|depolama)', 'disk'),
    (r'(sıcaklık|ısı|temperature|heat|temp)', 'temp'),
    (r'(kapat|shutdown|kapan)', 'shutdown'),
    (r'(yeniden.başlat|reboot|restart)', 'reboot'),
    (r'(process|işlem|ps|task)', 'process'),
    (r'(ağ|network|ip|internet|bağlantı)', 'network'),
    (r'(servis|service|systemd)', 'service'),
    (r'(güncelleme|update|upgrade|paket)', 'update'),
    (r'(uptime|açık.kalma|ne.kadar.süredir)', 'uptime'),
    (r'(kim|users|kullanıcı|who)', 'users'),
    (r'(tarih|saat|date|time|now)', 'datetime'),
    (r'(yardım|help|ne.yapabilirsin|komutlar)', 'help'),
    (r'(log|günlük|journal)', 'log'),
]

def _detect_intent(msg):
    msg_lower = msg.lower().strip()
    for pattern, intent in _intents:
        if re.search(pattern, msg_lower):
            return intent
    return 'shell'

def _format_bytes(b):
    if b > 1e12: return f"{b/1e12:.2f} TB"
    if b > 1e9: return f"{b/1e9:.2f} GB"
    if b > 1e6: return f"{b/1e6:.2f} MB"
    if b > 1e3: return f"{b/1e3:.1f} KB"
    return f"{b} B"

def _handle_intent(session, intent, msg):
    if intent == 'merhaba':
        return "Merhaba! Ben PC asistanınız. Sisteminiz hakkında sorular sorabilir veya komutlar verebilirsiniz. `yardım` yazın neler yapabildiğimi göreyim."

    elif intent == 'cpu':
        cpu = psutil.cpu_percent(interval=0.3)
        count = psutil.cpu_count()
        freq = psutil.cpu_freq()
        load = psutil.getloadavg()
        return (
            f"**CPU Durumu:**\n"
            f"- Kullanım: %{cpu:.1f}\n"
            f"- Çekirdek: {psutil.cpu_count(logical=False)} fiziksel / {count} mantıksal\n"
            f"- Frekans: {freq.current:.0f} MHz / {freq.max:.0f} MHz (max)\n"
            f"- Yük: {load[0]:.2f} / {load[1]:.2f} / {load[2]:.2f}"
        )

    elif intent == 'ram' or intent == 'memory':
        mem = psutil.virtual_memory()
        swap = psutil.swap_memory()
        return (
            f"**Bellek Durumu:**\n"
            f"- Toplam: {_format_bytes(mem.total)}\n"
            f"- Kullanılan: {_format_bytes(mem.used)} (%{mem.percent:.1f})\n"
            f"- Boş: {_format_bytes(mem.available)}\n"
            f"- Swap: {_format_bytes(swap.used)} / {_format_bytes(swap.total)}"
        )

    elif intent == 'disk':
        usage = shutil.disk_usage("/")
        disks = []
        for dp in psutil.disk_partitions():
            try:
                d = psutil.disk_usage(dp.mountpoint)
                disks.append(f"- {dp.device} ({dp.mountpoint}): {_format_bytes(d.used)} / {_format_bytes(d.total)} (%{d.percent:.0f})")
            except: pass
        return (
            f"**Disk Durumu:**\n" + "\n".join(disks)
        )

    elif intent == 'temp':
        temps = []
        for name, entries in psutil.sensors_temperatures().items():
            for entry in entries:
                temps.append(f"- {entry.label or name}: {entry.current}°C" + (f" (max: {entry.high}°C)" if entry.high else ""))
        if not temps:
            return "Sıcaklık sensörü bulunamadı."
        return "**Sıcaklıklar:**\n" + "\n".join(temps)

    elif intent == 'shutdown':
        import threading
        threading.Timer(3, lambda: subprocess.run(["poweroff"])).start()
        return "⚠️ Bilgisayar kapatılıyor... (3 saniye içinde)"

    elif intent == 'reboot':
        import threading
        threading.Timer(3, lambda: subprocess.run(["reboot"])).start()
        return "⚠️ Bilgisayar yeniden başlatılıyor... (3 saniye içinde)"

    elif intent == 'process':
        procs = []
        for p in psutil.process_iter(["pid", "name", "cpu_percent", "memory_percent"]):
            try: procs.append(p.info)
            except: pass
        procs.sort(key=lambda x: x.get("cpu_percent", 0) or 0, reverse=True)
        top = procs[:8]
        lines = [f"**En çok CPU harcayan process'ler:**"]
        for p in top:
            lines.append(f"- PID {p['pid']}: {p['name']} (%CPU: {p['cpu_percent']:.1f}, %RAM: {p['memory_percent']:.1f})")
        return "\n".join(lines)

    elif intent == 'network':
        net = psutil.net_io_counters()
        ifaces = []
        for name, addrs in psutil.net_if_addrs().items():
            ips = [a.address for a in addrs if a.family == 2]
            if ips:
                ifaces.append(f"- {name}: {', '.join(ips)}")
        return (
            f"**Ağ Durumu:**\n" + "\n".join(ifaces) +
            f"\n\n**Trafik:**\n"
            f"- Gönderilen: {_format_bytes(net.bytes_sent)}\n"
            f"- Alınan: {_format_bytes(net.bytes_recv)}"
        )

    elif intent == 'service':
        try:
            result = subprocess.run(["systemctl", "list-units", "--type=service", "--no-pager", "--no-legend"], capture_output=True, text=True, timeout=5)
            lines = [l for l in result.stdout.strip().split("\n") if l.strip()][:10]
            out = ["**İlk 10 servis:**"]
            for l in lines:
                parts = l.split()
                if len(parts) >= 3:
                    out.append(f"- {parts[0]}: {parts[2]}")
            return "\n".join(out)
        except: return "Servisler alınamadı."

    elif intent == 'update':
        try:
            result = subprocess.run(["pacman", "-Qu"], capture_output=True, text=True, timeout=10)
            updates = [l for l in result.stdout.strip().split("\n") if l.strip()]
            if not updates:
                return "Sistem güncel. 👍"
            return f"**{len(updates)} güncelleme mevcut:**\n" + "\n".join(f"- {u}" for u in updates[:15])
        except: return "Güncelleme kontrol edilemedi."

    elif intent == 'uptime':
        boot = psutil.boot_time()
        uptime_sec = time.time() - boot
        days = int(uptime_sec // 86400)
        hours = int((uptime_sec % 86400) // 3600)
        mins = int((uptime_sec % 3600) // 60)
        boot_str = time.strftime("%d.%m.%Y %H:%M:%S", time.localtime(boot))
        return f"**Sistem Bilgisi:**\n- Açık kalma: {days}g {hours}s {mins}d\n- Açılış: {boot_str}"

    elif intent == 'users':
        users = psutil.users()
        if not users:
            return "Aktif kullanıcı yok."
        lines = [f"**Aktif kullanıcılar:**"]
        for u in users:
            lines.append(f"- {u.name} (terminal: {u.terminal or '?,'}, host: {u.host or 'local'})")
        return "\n".join(lines)

    elif intent == 'datetime':
        now = time.strftime("%d.%m.%Y %H:%M:%S")
        return f"Şu an: **{now}**"

    elif intent == 'log':
        try:
            result = subprocess.run(["journalctl", "-n", "10", "--no-pager", "-o", "short-iso"], capture_output=True, text=True, timeout=5)
            lines = [l for l in result.stdout.strip().split("\n") if l.strip()][:10]
            return "**Son 10 log:**\n" + "\n".join(f"- {l}" for l in lines)
        except: return "Log alınamadı."

    elif intent == 'help':
        return (
            "**Yapabileceklerim:**\n\n"
            "Sistem soruları:\n"
            "• `cpu` - İşlemci durumu\n"
            "• `ram` / `bellek` - RAM kullanımı\n"
            "• `disk` - Disk kullanımı\n"
            "• `sıcaklık` - Sıcaklık değerleri\n"
            "• `ağ` / `network` - Ağ bilgileri\n"
            "• `process` - En çok CPU harcayan process'ler\n"
            "• `uptime` - Açık kalma süresi\n"
            "• `servis` - Servis durumları\n"
            "• `güncelleme` - Paket güncellemeleri\n"
            "• `log` - Son sistem logları\n\n"
            "İşlemler:\n"
            "• `kapat` - Bilgisayarı kapat\n"
            "• `reboot` - Yeniden başlat\n\n"
            "Ayrıca **shell komutları** da çalıştırabilirim. "
            "Örn: `ls -la`, `df -h`, `free -h`"
        )

    return None

@router.get("/chat/start")
def chat_start():
    session = ChatSession()
    _sessions[session.id] = session
    hostname = __import__("socket").gethostname()
    return {
        "session_id": session.id,
        "message": f"Merhaba! Ben **{hostname}**'in asistanıyım. Sana nasıl yardımcı olabilirim? `yardım` yazın neler yapabildiğimi görebilirsin.",
    }

@router.post("/chat/{session_id}")
def chat_message(session_id: str, body: dict):
    if session_id not in _sessions:
        raise HTTPException(404, "Session bulunamadı veya süresi doldu.")
    session = _sessions[session_id]
    msg = (body.get("message") or "").strip()
    if not msg:
        return {"response": "Bir mesaj yazmalısın."}

    intent = _detect_intent(msg)
    response = _handle_intent(session, intent, msg)

    if response is None:
        cmd = msg.strip()
        output = session.exec_cmd(cmd)
        if output:
            if len(output) > 2000:
                output = output[:2000] + "\n... (çıktı çok uzun, kesildi)"
            response = f"**`$ {cmd}`**\n```\n{output}\n```"
        else:
            output = session.run_direct(cmd.split())
            if output:
                if len(output) > 2000:
                    output = output[:2000] + "\n... (çıktı çok uzun, kesildi)"
                response = f"**`$ {cmd}`**\n```\n{output}\n```"
            else:
                response = f"`{cmd}` çalıştırıldı ama çıktı alınamadı."

    session.history.append({"role": "user", "message": msg})
    session.history.append({"role": "assistant", "message": response})

    return {"response": response}

@router.delete("/chat/{session_id}")
def chat_end(session_id: str):
    if session_id in _sessions:
        _sessions[session_id].close()
    return {"success": True}

@router.get("/chat/sessions")
def list_sessions():
    return {"active": list(_sessions.keys())}
