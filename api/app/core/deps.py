"""FastAPI authentication dependencies using Clerk.

Provides two dependency functions:
  - get_current_user: Requires a valid Clerk session token. Returns user claims.
  - get_optional_user: Returns user claims if a token is presented and valid,
    None for guests. Guest-first policy (see CLAUDE.md): search, stream,
    lyrics, trending, recently played and downloads work without an account;
    playlists, likes, recommendations and analytics are account features.

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

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core import error_codes
from app.core.auth import verify_clerk_token

_bearer = HTTPBearer(auto_error=False)


def _dev_identity() -> dict[str, Any]:
    """Synthetic identity for explicit-development, Clerk-less instances."""
    return {
        "sub": "dev-user-local",
        "email": "dev@localhost",
        "first_name": "Developer",
        "_dev": True,
    }


async def get_optional_user(
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict[str, Any] | None:
    """Resolve the caller as an account holder or a guest.

    - No token           -> None (guest). Guest endpoints serve their
                            guest experience; account endpoints are
                            expected to 401 on their own terms.
    - Valid token        -> Clerk claims.
    - INVALID token      -> 401. A presented-but-bad token must never
                            silently degrade to guest: that would turn
                            every expiry/bug into a mysterious loss of
                            account data instead of a visible re-login.
    """
    from app.core.config import settings

    if settings.is_dev and not settings.has_clerk:
        return _dev_identity()

    if not settings.has_clerk:
        # Auth unconfigured in production: everyone gets the guest experience.
        return None

    if cred is None:
        return None

    claims = await verify_clerk_token(cred.credentials)
    if claims is None:
        raise error_codes.fail(
            error_codes.AUTH.INVALID_TOKEN,
            status.HTTP_401_UNAUTHORIZED,
            headers={"WWW-Authenticate": "Bearer"},
        )
    return claims


async def get_current_user(
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict[str, Any]:
    """Require a valid Clerk session token. Raises 401 if missing/invalid.

    Synthetic dev identity is ONLY issued when the environment is explicitly
    development AND Clerk is unconfigured. In production (or any staging)
    deployment with Clerk missing, every protected endpoint fails closed
    with 401 rather than silently treating everyone as the same user — an
    unauthenticated shared "dev user" across a real deployment would be an
    auth bypass (all users' playlists/likes/history keyed to one sub).
    """
    from app.core.config import settings

    # ── Dev fallback: only in an explicit development environment ──
    if settings.is_dev and not settings.has_clerk:
        return _dev_identity()

    if not settings.has_clerk:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication is not configured on this instance",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if cred is None:
        raise error_codes.fail(
            error_codes.AUTH.NOT_SIGNED_IN,
            status.HTTP_401_UNAUTHORIZED,
            headers={"WWW-Authenticate": "Bearer"},
        )

    claims = await verify_clerk_token(cred.credentials)
    if claims is None:
        raise error_codes.fail(
            error_codes.AUTH.INVALID_TOKEN,
            status.HTTP_401_UNAUTHORIZED,
            headers={"WWW-Authenticate": "Bearer"},
        )

    return claims


def user_sub(claims: dict[str, Any]) -> str:
    """The canonical per-user key for every user-scoped store."""
    return claims["sub"]
