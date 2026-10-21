"""Kullanıcı deposu: config.json içindeki "users" listesi.

"users" henüz yoksa eski tek-şifreli kurulum, "admin" adlı tek bir yönetici
olarak görünür ve şifresi auth._get_password_hash() üzerinden doğrulanır.
Listeyi ilk değiştiren işlem bu yöneticiyi gerçek bir kayda dönüştürür.
"""
import re
import json
import time
import threading
import pyotp
from auth import (
    CONFIG_PATH, ROLES, _hash_bcrypt, check_bcrypt, verify_password,
    upgrade_hash, _get_password_hash, revoke_sessions, update_session_role,
)

USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{2,32}$")
MIN_PASSWORD_LEN = 6
LEGACY_ADMIN = "admin"

_lock = threading.Lock()


class UserError(ValueError):
    pass


def _load_cfg() -> dict:
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return {}


def _save_cfg(cfg: dict):
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2, ensure_ascii=False))


def _users(cfg: dict) -> list[dict]:
    users = cfg.get("users")
    if users:
        return users
    return [{"username": LEGACY_ADMIN, "role": "admin", "legacy": True}]


def _materialize(cfg: dict) -> list[dict]:
    if not cfg.get("users"):
        cfg["users"] = [{
            "username": LEGACY_ADMIN,
            "role": "admin",
            "password_hash": _get_password_hash(),
            "created": int(time.time()),
        }]
    return cfg["users"]


def public_user(u: dict) -> dict:
    return {
        "username": u["username"],
        "role": u.get("role", "viewer"),
        "totp_enabled": bool(u.get("totp_enabled")),
        "created": u.get("created"),
    }


def list_users() -> list[dict]:
    return [public_user(u) for u in _users(_load_cfg())]


def get_user(username: str) -> dict | None:
    for u in _users(_load_cfg()):
        if u["username"] == username:
            return u
    return None


def default_login_username() -> str:
    users = _users(_load_cfg())
    for u in users:
        if u["username"] == LEGACY_ADMIN:
            return LEGACY_ADMIN
    admins = [u for u in users if u.get("role") == "admin"]
    return (admins or users)[0]["username"]


def check_password(user: dict, password: str) -> bool:
    if user.get("legacy"):
        ok = verify_password(password)
        if ok:
            upgrade_hash(password)
        return ok
    return check_bcrypt(password, user.get("password_hash", ""))


def authenticate(username: str, password: str) -> dict | None:
    user = get_user(username)
    if user and check_password(user, password):
        return user
    return None


def verify_totp(user: dict, code: str) -> bool:
    secret = user.get("totp_secret")
    if not secret or not code:
        return False
    return pyotp.TOTP(secret).verify(code.strip().replace(" ", ""), valid_window=1)


def _validate_password(password: str):
    if len(password or "") < MIN_PASSWORD_LEN:
        raise UserError(f"Şifre en az {MIN_PASSWORD_LEN} karakter olmalı")


def _admin_count(users: list[dict]) -> int:
    return sum(1 for u in users if u.get("role") == "admin")


def create_user(username: str, password: str, role: str = "viewer") -> dict:
    username = (username or "").strip()
    if not USERNAME_RE.match(username):
        raise UserError("Kullanıcı adı 2-32 karakter olmalı (harf, rakam, _ . -)")
    if role not in ROLES:
        raise UserError("Geçersiz rol")
    _validate_password(password)
    with _lock:
        cfg = _load_cfg()
        users = _materialize(cfg)
        if any(u["username"] == username for u in users):
            raise UserError("Bu kullanıcı adı zaten var")
        user = {
            "username": username,
            "role": role,
            "password_hash": _hash_bcrypt(password),
            "created": int(time.time()),
        }
        users.append(user)
        _save_cfg(cfg)
    return public_user(user)


def update_user(username: str, role: str | None = None, password: str | None = None) -> dict:
    if role is not None and role not in ROLES:
        raise UserError("Geçersiz rol")
    if password is not None:
        _validate_password(password)
    with _lock:
        cfg = _load_cfg()
        users = _materialize(cfg)
        user = next((u for u in users if u["username"] == username), None)
        if not user:
            raise KeyError(username)
        if role is not None and role != user.get("role"):
            if user.get("role") == "admin" and _admin_count(users) <= 1:
                raise UserError("Son yönetici hesabının rolü değiştirilemez")
            user["role"] = role
        if password is not None:
            user["password_hash"] = _hash_bcrypt(password)
            if username == LEGACY_ADMIN:
                cfg["_password_hash"] = user["password_hash"]
        _save_cfg(cfg)
    if role is not None:
        update_session_role(username, role)
    return public_user(user)


def delete_user(username: str):
    with _lock:
        cfg = _load_cfg()
        users = _materialize(cfg)
        user = next((u for u in users if u["username"] == username), None)
        if not user:
            raise KeyError(username)
        if user.get("role") == "admin" and _admin_count(users) <= 1:
            raise UserError("Son yönetici hesabı silinemez")
        users.remove(user)
        _save_cfg(cfg)
    revoke_sessions(username=username)


def _mutate(username: str, fn):
    with _lock:
        cfg = _load_cfg()
        users = _materialize(cfg)
        user = next((u for u in users if u["username"] == username), None)
        if not user:
            raise KeyError(username)
        result = fn(user)
        _save_cfg(cfg)
        return result


def begin_totp(username: str, issuer: str = "PC Manager") -> dict:
    secret = pyotp.random_base32()

    def fn(user):
        user["totp_pending"] = secret
    _mutate(username, fn)
    uri = pyotp.TOTP(secret).provisioning_uri(name=username, issuer_name=issuer)
    return {"secret": secret, "uri": uri}


def confirm_totp(username: str, code: str):
    def fn(user):
        pending = user.get("totp_pending")
        if not pending:
            raise UserError("Önce 2FA kurulumunu başlatın")
        if not pyotp.TOTP(pending).verify((code or "").strip(), valid_window=1):
            raise UserError("Doğrulama kodu hatalı")
        user["totp_secret"] = pending
        user["totp_enabled"] = True
        user.pop("totp_pending", None)
    _mutate(username, fn)


def disable_totp(username: str):
    def fn(user):
        user.pop("totp_secret", None)
        user.pop("totp_pending", None)
        user["totp_enabled"] = False
    _mutate(username, fn)


def sync_setup_password(password_hash: str):
    """Kurulum sihirbazı şifreyi değiştirdiğinde yönetici kaydını da güncelle."""
    with _lock:
        cfg = _load_cfg()
        users = cfg.get("users")
        if not users:
            return
        target = next((u for u in users if u["username"] == LEGACY_ADMIN), None)
        target = target or next((u for u in users if u.get("role") == "admin"), None)
        if target:
            target["password_hash"] = password_hash
            _save_cfg(cfg)
