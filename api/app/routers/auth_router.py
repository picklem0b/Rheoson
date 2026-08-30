"""Authentication routes — register, login, profile."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr

from app.core.auth import create_access_token, hash_password, verify_password
from app.core.database import get_db
from app.core.deps import get_current_user

router = APIRouter()


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    display_name: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class UpdateProfileRequest(BaseModel):
    display_name: str | None = None


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(body: RegisterRequest, db: AsyncIOMotorDatabase = Depends(get_db)):
    existing = await db.users.find_one({"email": body.email})
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    now = datetime.now(timezone.utc)
    user_doc = {
        "email": body.email,
        "password_hash": hash_password(body.password),
        "display_name": body.display_name or body.email.split("@")[0],
        "created_at": now,
        "updated_at": now,
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)
    token = create_access_token({"sub": user_id})
    return TokenResponse(
        access_token=token,
        user={"id": user_id, "email": body.email, "display_name": user_doc["display_name"]},
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncIOMotorDatabase = Depends(get_db)):
    user = await db.users.find_one({"email": body.email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    user_id = str(user["_id"])
    token = create_access_token({"sub": user_id})
    return TokenResponse(
        access_token=token,
        user={"id": user_id, "email": user["email"], "display_name": user.get("display_name", "")},
    )


@router.get("/me")
async def get_profile(user: dict = Depends(get_current_user)):
    return {
        "id": str(user["_id"]),
        "email": user["email"],
        "display_name": user.get("display_name", ""),
        "created_at": user.get("created_at"),
    }


@router.patch("/me")
async def update_profile(
    body: UpdateProfileRequest,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    updates: dict = {"updated_at": datetime.now(timezone.utc)}
    if body.display_name is not None:
        updates["display_name"] = body.display_name
    await db.users.update_one({"_id": user["_id"]}, {"$set": updates})
    return {"ok": True}
