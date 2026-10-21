import time
import threading
from collections import defaultdict, deque
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES, API_TOKEN_MAX_DAYS, create_session,
    list_sessions, get_session, revoke_session, revoke_sessions,
)
from dependencies import require_auth
import users as user_store

router = APIRouter(tags=["auth"])

# ─── Kaba kuvvet koruması ─────────────────────────────────────────────────────
MAX_FAILURES = 10
FAILURE_WINDOW = 300
_failures: dict[str, deque] = defaultdict(deque)
_failures_lock = threading.Lock()


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "?"


def _check_rate_limit(ip: str):
    now = time.time()
    with _failures_lock:
        q = _failures[ip]
        while q and now - q[0] > FAILURE_WINDOW:
            q.popleft()
        if len(q) >= MAX_FAILURES:
            retry = int(FAILURE_WINDOW - (now - q[0])) + 1
            raise HTTPException(429, f"Çok fazla başarısız deneme. {retry} sn sonra tekrar deneyin.")


def _record_failure(ip: str):
    with _failures_lock:
        _failures[ip].append(time.time())


def _clear_failures(ip: str):
    with _failures_lock:
        _failures.pop(ip, None)


class LoginRequest(BaseModel):
    password: str
    username: str | None = None
    totp: str | None = None


class LoginResponse(BaseModel):
    token: str
    expires_in: int
    username: str
    role: str


@router.post("/auth/login", response_model=LoginResponse)
def login(body: LoginRequest, request: Request):
    ip = _client_ip(request)
    _check_rate_limit(ip)
    username = (body.username or "").strip() or user_store.default_login_username()
    user = user_store.authenticate(username, body.password)
    if not user:
        _record_failure(ip)
        raise HTTPException(401, "Geçersiz kullanıcı adı veya şifre")
    if user.get("totp_enabled"):
        if not body.totp:
            raise HTTPException(401, "totp_required")
        if not user_store.verify_totp(user, body.totp):
            _record_failure(ip)
            raise HTTPException(401, "totp_invalid")
    _clear_failures(ip)
    role = user.get("role", "viewer")
    token, _ = create_session(
        user["username"], role, kind="web",
        ip=ip, user_agent=request.headers.get("user-agent", ""),
    )
    return LoginResponse(token=token, expires_in=ACCESS_TOKEN_EXPIRE_MINUTES,
                         username=user["username"], role=role)


@router.get("/auth/me")
def me(auth: dict = Depends(require_auth)):
    user = user_store.get_user(auth["username"]) if auth.get("kind") != "mobile" else None
    return {
        "username": auth["username"],
        "role": auth["role"],
        "kind": auth.get("kind"),
        "totp_enabled": bool(user and user.get("totp_enabled")),
    }


@router.post("/auth/logout")
def logout(auth: dict = Depends(require_auth)):
    if auth.get("jti"):
        revoke_session(auth["jti"])
    return {"success": True}


@router.get("/auth/sessions")
def sessions(all: bool = False, auth: dict = Depends(require_auth)):
    if auth.get("kind") == "mobile":
        return []
    scope = None if (all and auth["role"] == "admin") else auth["username"]
    items = list_sessions(scope)
    for s in items:
        s["current"] = s["jti"] == auth.get("jti")
    return items


@router.delete("/auth/sessions/{jti}")
def delete_session(jti: str, auth: dict = Depends(require_auth)):
    s = get_session(jti)
    if not s:
        raise HTTPException(404, "Oturum bulunamadı")
    if s.get("username") != auth["username"] and auth["role"] != "admin":
        raise HTTPException(403, "Bu oturumu kapatma yetkiniz yok")
    revoke_session(jti)
    return {"success": True}


@router.post("/auth/sessions/revoke-others")
def revoke_others(auth: dict = Depends(require_auth)):
    if auth.get("kind") == "mobile":
        raise HTTPException(400, "Mobil cihaz oturumu için kullanılamaz")
    n = revoke_sessions(username=auth["username"], except_jti=auth.get("jti"))
    return {"success": True, "revoked": n}


def _require_user(auth: dict) -> dict:
    if auth.get("kind") == "mobile":
        raise HTTPException(400, "Bu işlem mobil cihaz oturumunda yapılamaz")
    user = user_store.get_user(auth["username"])
    if not user:
        raise HTTPException(404, "Kullanıcı bulunamadı")
    return user


class PasswordChange(BaseModel):
    current: str
    new: str


@router.post("/auth/password")
def change_password(body: PasswordChange, auth: dict = Depends(require_auth)):
    user = _require_user(auth)
    if not user_store.check_password(user, body.current):
        raise HTTPException(400, "Mevcut şifre hatalı")
    try:
        user_store.update_user(user["username"], password=body.new)
    except user_store.UserError as e:
        raise HTTPException(400, str(e))
    revoke_sessions(username=user["username"], except_jti=auth.get("jti"))
    return {"success": True}


@router.post("/auth/2fa/setup")
def totp_setup(auth: dict = Depends(require_auth)):
    user = _require_user(auth)
    if user.get("totp_enabled"):
        raise HTTPException(400, "2FA zaten etkin")
    return user_store.begin_totp(user["username"])


class TotpCode(BaseModel):
    code: str


@router.post("/auth/2fa/enable")
def totp_enable(body: TotpCode, auth: dict = Depends(require_auth)):
    user = _require_user(auth)
    try:
        user_store.confirm_totp(user["username"], body.code)
    except user_store.UserError as e:
        raise HTTPException(400, str(e))
    return {"success": True}


class TotpDisable(BaseModel):
    password: str


@router.post("/auth/2fa/disable")
def totp_disable(body: TotpDisable, auth: dict = Depends(require_auth)):
    user = _require_user(auth)
    if not user_store.check_password(user, body.password):
        raise HTTPException(400, "Şifre hatalı")
    user_store.disable_totp(user["username"])
    return {"success": True}


class ApiTokenRequest(BaseModel):
    name: str
    days: int = 365
    role: str | None = None


@router.post("/auth/tokens")
def create_api_token(body: ApiTokenRequest, request: Request, auth: dict = Depends(require_auth)):
    """Uzun ömürlü API token'ı (Prometheus, betikler, uzak sunucular için)."""
    user = _require_user(auth)
    name = body.name.strip()[:60]
    if not name:
        raise HTTPException(400, "Token adı gerekli")
    role = body.role or user.get("role", "viewer")
    if role not in ("admin", "viewer") or (role == "admin" and user.get("role") != "admin"):
        raise HTTPException(400, "Geçersiz rol")
    days = max(1, min(body.days or API_TOKEN_MAX_DAYS, API_TOKEN_MAX_DAYS))
    token, jti = create_session(
        user["username"], role, kind="api", name=name,
        expire_minutes=days * 24 * 60, ip=_client_ip(request),
    )
    return {"token": token, "jti": jti, "name": name, "role": role, "days": days}
