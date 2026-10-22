import os
import json
import time
import hashlib
import secrets
import threading
from pathlib import Path
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from fastapi import HTTPException, status
import bcrypt

ALGORITHM = "HS256"
API_TOKEN_MAX_DAYS = 3650


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


# Web oturumları KAYAN süreli: her kullanımda "boşta kalma" süresi uzar, ama
# oturum açıldığı andan itibaren SESSION_MAX_DAYS gün sonra mutlaka biter.
# (Eskiden sabit 8 saatti; sürekli açık duran bir telefon panelinden atılıyordu.)
SESSION_IDLE_MINUTES = max(5, int(_env_float("PCMANAGER_SESSION_HOURS", 24) * 60))
SESSION_MAX_DAYS = max(1, int(_env_float("PCMANAGER_SESSION_MAX_DAYS", 30)))
ACCESS_TOKEN_EXPIRE_MINUTES = SESSION_IDLE_MINUTES  # istemciye bildirilen süre
MAX_WEB_SESSIONS_PER_USER = 20

CONFIG_PATH = Path(__file__).parent / "config.json"
JWT_SECRET_PATH = Path(__file__).parent / ".jwt_secret"
SESSIONS_PATH = Path(__file__).parent / "sessions.json"

ROLES = ("admin", "viewer")


def _read_secret() -> str:
    try:
        value = JWT_SECRET_PATH.read_text().strip()
    except OSError:
        return ""
    if value:
        try:
            os.chmod(JWT_SECRET_PATH, 0o600)  # eski kurulumlarda herkese açık olabilir
        except OSError:
            pass
    return value


def _get_secret_key() -> str:
    env_key = os.environ.get("PCMANAGER_SECRET")
    if env_key:
        return env_key
    existing = _read_secret()
    if existing:
        return existing
    key = secrets.token_hex(32)
    try:
        # O_EXCL: iki süreç aynı anda ilk kez başlarsa yalnızca biri yazar, diğeri onunkini okur
        fd = os.open(JWT_SECRET_PATH, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(key)
    except FileExistsError:
        existing = _read_secret()
        if existing:
            return existing
        try:  # boş/bozuk dosya
            JWT_SECRET_PATH.write_text(key)
            os.chmod(JWT_SECRET_PATH, 0o600)
        except OSError as e:
            print(f"[auth] UYARI: {JWT_SECRET_PATH} yazılamadı ({e}); oturumlar yeniden başlatınca geçersiz olacak")
    except OSError as e:
        print(f"[auth] UYARI: {JWT_SECRET_PATH} yazılamadı ({e}); oturumlar yeniden başlatınca geçersiz olacak")
    return key


SECRET_KEY = _get_secret_key()


def _hash_bcrypt(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def check_bcrypt(password: str, stored: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), stored.encode("utf-8"))
    except Exception:
        return False


def _get_password_hash() -> str:
    _raw = os.environ.get("PCMANAGER_PASSWORD", "")
    if _raw:
        return _hash_bcrypt(_raw)
    _hash = os.environ.get("PCMANAGER_PASSWORD_HASH", "")
    if _hash:
        return _hash
    if CONFIG_PATH.exists():
        try:
            cfg = json.loads(CONFIG_PATH.read_text())
            ph = cfg.get("_password_hash", "")
            if ph:
                return ph
        except (json.JSONDecodeError, OSError):
            pass
    return _hash_bcrypt("pcmanager")


def verify_password(password: str) -> bool:
    stored = _get_password_hash()
    if check_bcrypt(password, stored):
        return True
    try:
        return hashlib.sha256(password.encode()).hexdigest() == stored
    except Exception:
        pass
    return False


def upgrade_hash(password: str) -> str | None:
    stored = _get_password_hash()
    if stored.startswith("$2"):
        return None
    new_hash = _hash_bcrypt(password)
    if CONFIG_PATH.exists():
        try:
            cfg = json.loads(CONFIG_PATH.read_text())
            cfg["_password_hash"] = new_hash
            CONFIG_PATH.write_text(json.dumps(cfg, indent=2, ensure_ascii=False))
            if "PCMANAGER_PASSWORD_HASH" in os.environ:
                os.environ["PCMANAGER_PASSWORD_HASH"] = new_hash
        except Exception:
            pass
    return new_hash


def is_configured() -> bool:
    """Kurulum sihirbazı tamamlandı mı (ya da şifre ortam değişkeniyle verildi mi)?

    Tamamlanmadan önce herkesin bildiği varsayılan şifreyle giriş YAPILAMAZ;
    aksi halde yeni kurulmuş ve ağa açık bir cihaz, sihirbaz bitmeden tam
    yetkiyle (terminal dahil) ele geçirilebilirdi.
    PCMANAGER_ALLOW_DEFAULT_PASSWORD=1 yalnızca testler/geliştirme içindir.
    """
    if os.environ.get("PCMANAGER_ALLOW_DEFAULT_PASSWORD") == "1":
        return True
    if os.environ.get("PCMANAGER_PASSWORD") or os.environ.get("PCMANAGER_PASSWORD_HASH"):
        return True
    try:
        cfg = json.loads(CONFIG_PATH.read_text())
    except (OSError, ValueError):
        return False
    setup = cfg.get("setup")
    return bool((isinstance(setup, dict) and setup.get("completed")) or cfg.get("_password_hash") or cfg.get("users"))


def create_access_token(data: dict, expire_minutes: int = SESSION_IDLE_MINUTES) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=expire_minutes)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


# ─── Oturumlar ────────────────────────────────────────────────────────────────
# Her web girişi ve API token'ı sessions.json içinde bir kayıt (jti) açar.
# Token yalnızca kaydı hâlâ duruyorsa geçerlidir; böylece oturum kapatma,
# "diğer oturumları kapat" ve kullanıcı silme anında etkili olur.

_sessions_lock = threading.Lock()
_sessions_cache: dict = {"mtime": None, "data": {}}
_LAST_SEEN_INTERVAL = 60


def _load_sessions() -> dict:
    try:
        mtime = SESSIONS_PATH.stat().st_mtime_ns
    except OSError:
        _sessions_cache.update(mtime=None, data={})
        return {}
    if _sessions_cache["mtime"] != mtime:
        try:
            data = json.loads(SESSIONS_PATH.read_text())
        except (json.JSONDecodeError, OSError):
            data = {}
        _sessions_cache.update(mtime=mtime, data=data)
    return _sessions_cache["data"]


def _save_sessions(data: dict):
    tmp = SESSIONS_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    try:
        os.chmod(tmp, 0o600)
    except OSError:
        pass
    tmp.replace(SESSIONS_PATH)
    _sessions_cache.update(mtime=SESSIONS_PATH.stat().st_mtime_ns, data=data)


def create_session(username: str, role: str, kind: str = "web", name: str = "",
                   expire_minutes: int | None = None,
                   ip: str = "", user_agent: str = "") -> tuple[str, str]:
    now = time.time()
    if kind == "web":
        idle = (expire_minutes or SESSION_IDLE_MINUTES) * 60
        absolute = now + SESSION_MAX_DAYS * 86400
        expires = min(now + idle, absolute)
        jwt_minutes = SESSION_MAX_DAYS * 24 * 60
    else:  # api: sabit süreli, kayan değil
        minutes = expire_minutes or SESSION_IDLE_MINUTES
        idle, expires, absolute = 0, now + minutes * 60, now + minutes * 60
        jwt_minutes = minutes
    jti = secrets.token_hex(16)
    with _sessions_lock:
        sessions = {k: v for k, v in _load_sessions().items() if v.get("expires", 0) > now}
        if kind == "web":
            # Kullanıcı başına web oturumu sayısını sınırla: en az kullanılanlar düşer
            mine = sorted(
                ((k, v) for k, v in sessions.items() if v.get("username") == username and v.get("kind", "web") == "web"),
                key=lambda kv: kv[1].get("last_seen", 0),
            )
            for k, _ in mine[: max(0, len(mine) - (MAX_WEB_SESSIONS_PER_USER - 1))]:
                sessions.pop(k)
        sessions[jti] = {
            "username": username,
            "role": role,
            "kind": kind,
            "name": name,
            "created": int(now),
            "last_seen": int(now),
            "expires": int(expires),
            "absolute": int(absolute),
            "idle": int(idle),
            "ip": ip,
            "user_agent": user_agent[:200],
        }
        _save_sessions(sessions)
    token = create_access_token({"sub": username, "jti": jti}, expire_minutes=jwt_minutes)
    return token, jti


def list_sessions(username: str | None = None) -> list[dict]:
    now = time.time()
    out = []
    for jti, s in _load_sessions().items():
        if s.get("expires", 0) <= now:
            continue
        if username is not None and s.get("username") != username:
            continue
        out.append({"jti": jti, **s})
    out.sort(key=lambda s: s.get("created", 0), reverse=True)
    return out


def get_session(jti: str) -> dict | None:
    return _load_sessions().get(jti)


def revoke_session(jti: str) -> bool:
    with _sessions_lock:
        sessions = dict(_load_sessions())
        if jti not in sessions:
            return False
        sessions.pop(jti)
        _save_sessions(sessions)
        return True


def revoke_sessions(username: str | None = None, except_jti: str | None = None) -> int:
    with _sessions_lock:
        sessions = dict(_load_sessions())
        doomed = [
            j for j, s in sessions.items()
            if j != except_jti and (username is None or s.get("username") == username)
        ]
        for j in doomed:
            sessions.pop(j)
        if doomed:
            _save_sessions(sessions)
        return len(doomed)


def update_session_role(username: str, role: str):
    with _sessions_lock:
        sessions = dict(_load_sessions())
        changed = False
        for s in sessions.values():
            if s.get("username") == username and s.get("role") != role:
                # API token'ları rolünü düşürmüş olabilir; yükseltme yapma
                if s.get("kind") == "api" and s.get("role") == "viewer":
                    continue
                s["role"] = role
                changed = True
        if changed:
            _save_sessions(sessions)


def _touch_session(jti: str, session: dict):
    """Son görülmeyi günceller ve web oturumunun boşta kalma süresini uzatır."""
    now = int(time.time())
    if now - session.get("last_seen", 0) < _LAST_SEEN_INTERVAL:
        return
    with _sessions_lock:
        sessions = dict(_load_sessions())
        current = sessions.get(jti)
        if not current:
            return
        updated = {**current, "last_seen": now}
        idle = current.get("idle", 0)
        if current.get("kind", "web") == "web" and idle:
            updated["expires"] = int(min(now + idle, current.get("absolute", now + idle)))
        sessions[jti] = updated
        try:
            _save_sessions(sessions)
        except OSError:
            pass


def _unauthorized(detail: str = "Geçersiz veya süresi dolmuş token"):
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


def verify_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise _unauthorized()

    # Mobil cihazlar için yetki doğrulama ve revoke kontrolü
    if payload.get("sub") == "mobile_client":
        device_id = payload.get("device_id")
        if not device_id:
            raise _unauthorized()
        cfg = {}
        if CONFIG_PATH.exists():
            try:
                cfg = json.loads(CONFIG_PATH.read_text())
            except (json.JSONDecodeError, OSError):
                cfg = {}
        paired_devices = cfg.get("paired_devices", [])
        if not any(d.get("device_id") == device_id for d in paired_devices):
            raise _unauthorized("Cihaz yetkisi kaldırılmış")
        return {**payload, "username": "mobile_client", "role": "admin", "kind": "mobile"}

    jti = payload.get("jti")
    session = get_session(jti) if jti else None
    if not session or session.get("expires", 0) <= time.time():
        raise _unauthorized("Oturum sonlandırılmış veya süresi dolmuş")
    _touch_session(jti, session)
    return {
        **payload,
        "username": session.get("username"),
        "role": session.get("role", "viewer"),
        "kind": session.get("kind", "web"),
    }
