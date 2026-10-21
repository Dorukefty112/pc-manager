from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from dependencies import require_admin
import users as user_store

router = APIRouter(tags=["users"])


class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "viewer"


class UserUpdate(BaseModel):
    role: str | None = None
    password: str | None = None


@router.get("/users")
def list_users(_: dict = Depends(require_admin)):
    return user_store.list_users()


@router.post("/users")
def create_user(body: UserCreate, _: dict = Depends(require_admin)):
    try:
        return user_store.create_user(body.username, body.password, body.role)
    except user_store.UserError as e:
        raise HTTPException(400, str(e))


@router.put("/users/{username}")
def update_user(username: str, body: UserUpdate, _: dict = Depends(require_admin)):
    try:
        return user_store.update_user(username, role=body.role, password=body.password)
    except KeyError:
        raise HTTPException(404, "Kullanıcı bulunamadı")
    except user_store.UserError as e:
        raise HTTPException(400, str(e))


@router.delete("/users/{username}")
def delete_user(username: str, auth: dict = Depends(require_admin)):
    if username == auth.get("username"):
        raise HTTPException(400, "Kendi hesabınızı silemezsiniz")
    try:
        user_store.delete_user(username)
    except KeyError:
        raise HTTPException(404, "Kullanıcı bulunamadı")
    except user_store.UserError as e:
        raise HTTPException(400, str(e))
    return {"success": True}


@router.post("/users/{username}/2fa/reset")
def reset_totp(username: str, _: dict = Depends(require_admin)):
    """Telefonunu kaybeden kullanıcı için 2FA'yı yönetici sıfırlar."""
    try:
        user_store.disable_totp(username)
    except KeyError:
        raise HTTPException(404, "Kullanıcı bulunamadı")
    return {"success": True}
