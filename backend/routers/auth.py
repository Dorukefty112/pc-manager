from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from auth import verify_password, create_access_token, upgrade_hash

router = APIRouter(tags=["auth"])

class LoginRequest(BaseModel):
    password: str

class LoginResponse(BaseModel):
    token: str
    expires_in: int

@router.post("/auth/login", response_model=LoginResponse)
def login(body: LoginRequest):
    if not verify_password(body.password):
        raise HTTPException(401, "Geçersiz şifre")
    upgrade_hash(body.password)
    token = create_access_token({"sub": "admin"})
    return LoginResponse(token=token, expires_in=480)
