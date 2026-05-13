from fastapi import Header, HTTPException, status
from auth import verify_token

def require_auth(authorization: str = Header(None)):
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
