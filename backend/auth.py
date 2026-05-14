import os
import json
import hashlib
import secrets
from pathlib import Path
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from fastapi import HTTPException, status
import bcrypt

SECRET_KEY = os.environ.get("PCMANAGER_SECRET", secrets.token_hex(32))
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480

CONFIG_PATH = Path(__file__).parent / "config.json"


def _hash_bcrypt(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


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
    try:
        return bcrypt.checkpw(password.encode("utf-8"), stored.encode("utf-8"))
    except Exception:
        pass
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


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Geçersiz veya süresi dolmuş token"
        )
