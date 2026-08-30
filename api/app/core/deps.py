"""FastAPI authentication dependencies."""

from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.auth import decode_access_token
from app.core.database import get_db

_bearer = HTTPBearer()


async def get_current_user(
    cred: HTTPAuthorizationCredentials = Depends(_bearer),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    """Extract and validate the JWT, return the user document."""
    payload = decode_access_token(cred.credentials)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    user = await db.users.find_one({"_id": payload.get("sub")})
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return user
