from urllib.parse import parse_qs
from fastapi import Header, HTTPException, Request, WebSocket, status
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


# WebSocket kapanış kodları (4000-4999 uygulamaya ayrılmıştır).
# Bağlantı el sıkışmadan reddedilirse tarayıcı yalnızca "1006" görür ve nedenini
# bilemez; bu yüzden önce kabul edip ardından bu kodlarla kapatıyoruz. İstemci
# 4401'de oturumu temizleyip giriş ekranına döner, 4403'te yeniden denemeyi bırakır.
WS_UNAUTHORIZED = 4401
WS_FORBIDDEN = 4403


async def _ws_reject(websocket: WebSocket, code: int, reason: str):
    try:
        await websocket.accept()
        await websocket.close(code=code, reason=reason)
    except Exception:
        pass


async def authorize_ws(websocket: WebSocket, token: str | None = None, admin: bool = False) -> dict | None:
    """WebSocket yetkilendirmesi. Başarısızsa bağlantıyı 4401/4403 ile kapatıp None döner.

    Başarıda bağlantı HENÜZ kabul edilmemiştir; çağıran kendi accept()'ini yapar.
    """
    token = token or parse_qs(websocket.url.query).get("token", [None])[0]
    payload = verify_ws_token(token)
    if payload is None:
        await _ws_reject(websocket, WS_UNAUTHORIZED, "Oturum geçersiz veya süresi dolmuş")
        return None
    if admin and payload.get("role") != "admin":
        await _ws_reject(websocket, WS_FORBIDDEN, "Bu işlem için yönetici yetkisi gerekli")
        return None
    return payload
