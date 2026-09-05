"""FastAPI authentication dependencies using Clerk.

Provides two dependency functions:
  - get_current_user: Requires a valid Clerk session token. Returns user claims.
  - get_optional_user: Returns user claims if token present, None otherwise.

Usage in routers:
    @router.get("/protected")
    async def protected_route(user=Depends(get_current_user)):
        user_id = user["sub"]  # Clerk user ID
        ...

    @router.get("/optional")
    async def optional_route(user=Depends(get_optional_user)):
        if user:
            # Authenticated
            ...
        else:
            # Guest
            ...
"""

from __future__ import annotations

from typing import Any

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.auth import verify_clerk_token

# Deprecated alias removed. Authentication is mandatory: there is no guest
# identity anymore, so every dependency must resolve to a real Clerk sub.

_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict[str, Any]:
    """Require a valid Clerk session token. Raises 401 if missing/invalid."""
    if cred is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    claims = await verify_clerk_token(cred.credentials)
    if claims is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return claims


def user_sub(claims: dict[str, Any]) -> str:
    """The canonical per-user key for every user-scoped store."""
    return claims["sub"]
