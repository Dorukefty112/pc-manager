from fastapi import Header, HTTPException, Request, status
from auth import verify_token

READ_METHODS = {"GET", "HEAD", "OPTIONS"}

# Salt-okunur (viewer) kullanıcıların GET ile bile erişemeyeceği alanlar:
# dosya içerikleri, gizli ayarlar, terminal kayıtları, yedek arşivleri vb.
ADMIN_ONLY_PREFIXES = (
    "/api/files",
    "/api/settings",
    "/api/debug",
    "/api/pentest",
    "/api/users",
    "/api/backups",
    "/api/terminal",
    "/api/proxy",
    "/api/chat",
    "/api/ollama",
    "/api/telegram",
    "/api/pairing",
    "/api/hosts",
)

# Herkesin kendi hesabı için yazabileceği yollar (şifre, 2FA, oturumlar)
SELF_SERVICE_PREFIX = "/api/auth/"


def authenticate_header(authorization: str | None) -> dict:
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Yetkilendirme gerekli"
        )
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Geçersiz yetkilendirme formatı"
        )
    return verify_token(token)


def _forbidden():
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bu işlem için yönetici yetkisi gerekli")


def check_role(payload: dict, method: str, path: str):
    if payload.get("role") == "admin":
        return
    if path.startswith(SELF_SERVICE_PREFIX):
        return
    if method.upper() not in READ_METHODS or path.startswith(ADMIN_ONLY_PREFIXES):
        raise _forbidden()


def require_auth(request: Request, authorization: str = Header(None)):
    payload = authenticate_header(authorization)
    check_role(payload, request.method, request.url.path)
    return payload


def require_admin(request: Request, authorization: str = Header(None)):
    payload = authenticate_header(authorization)
    if payload.get("role") != "admin":
        raise _forbidden()
    return payload


def verify_ws_token(token: str | None, admin: bool = False) -> dict | None:
    """WebSocket'ler için token doğrulama. Geçersizse None döner."""
    if not token:
        return None
    try:
        payload = verify_token(token)
    except HTTPException:
        return None
    if admin and payload.get("role") != "admin":
        return None
    return payload
