"""FastAPI authentication dependencies.

Two issuers can present a bearer token to this API:

  - **Clerk** — a signed-in account, verified against Clerk's JWKS.
  - **guest** — a device session minted here (`services/guest_sessions.py`),
    verified locally with the instance's own secret. It backs the phone app,
    which opens without a sign-in wall.

Both resolve to the same thing: claims with a `sub`, which is the key every
per-user store is scoped by. Guest claims additionally carry `_guest`, so a
route that genuinely needs an account can say so.

Usage in routers:
    @router.get("/protected")
    async def protected_route(user=Depends(get_current_user)):
        user_id = user["sub"]
        ...
"""

from __future__ import annotations

from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core import error_codes
from app.core.auth import verify_clerk_token
from app.services.guest_sessions import decode_guest_token

_bearer = HTTPBearer(auto_error=False)


async def _resolve_token(token: str) -> dict[str, Any] | None:
    """Resolve a presented bearer token to claims, whichever kind it is.

    Guest tokens are tried first because they verify locally — no JWKS fetch,
    no network — and a Clerk token can never be accepted by that path.
    """
    guest = decode_guest_token(token)
    if guest is not None:
        return guest
    return await verify_clerk_token(token)


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
    """Resolve the caller as an identified user, or as nobody.

    - No token       -> None. Optional routes serve their anonymous experience.
    - Valid token    -> that identity's claims (account or guest).
    - Invalid token  -> 401. A presented-but-bad token must never silently
                        degrade to anonymous: that turns every expiry or bug
                        into a mysterious loss of account data instead of a
                        visible re-login.
    """
    from app.core.config import settings

    if cred is not None:
        claims = await _resolve_token(cred.credentials)
        if claims is not None:
            return claims
        # Checked before the unconfigured-Clerk case so a stale guest token is
        # reported as invalid rather than as "this instance has no auth".
        raise error_codes.fail(
            error_codes.AUTH.INVALID_TOKEN,
            status.HTTP_401_UNAUTHORIZED,
            headers={"WWW-Authenticate": "Bearer"},
        )

    if settings.is_dev and not settings.has_clerk:
        return _dev_identity()

    return None


async def get_current_user(
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict[str, Any]:
    """Require a valid token — a Clerk session or a guest session.

    The synthetic dev identity is issued ONLY when the environment is
    explicitly development AND Clerk is unconfigured. In any other deployment
    with Clerk missing, a request without a token fails closed with 401 rather
    than collapsing everyone onto one shared "dev user", which would be an auth
    bypass (all playlists, likes and history keyed to a single sub).
    """
    from app.core.config import settings

    if cred is not None:
        claims = await _resolve_token(cred.credentials)
        if claims is not None:
            return claims
        raise error_codes.fail(
            error_codes.AUTH.INVALID_TOKEN,
            status.HTTP_401_UNAUTHORIZED,
            headers={"WWW-Authenticate": "Bearer"},
        )

    # ── No token presented ────────────────────────────────────────
    if settings.is_dev and not settings.has_clerk:
        return _dev_identity()

    if not settings.has_clerk and not settings.ALLOW_GUEST_ACCOUNTS:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication is not configured on this instance",
            headers={"WWW-Authenticate": "Bearer"},
        )

    raise error_codes.fail(
        error_codes.AUTH.NOT_SIGNED_IN,
        status.HTTP_401_UNAUTHORIZED,
        headers={"WWW-Authenticate": "Bearer"},
    )


def user_sub(claims: dict[str, Any]) -> str:
    """The canonical per-user key for every user-scoped store."""
    return claims["sub"]
