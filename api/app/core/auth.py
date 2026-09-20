"""Clerk JWT verification and user helpers.

Replaces the old passlib/jose auth system. Clerk handles:
- User registration and login (via its own API/frontend SDK)
- Password hashing (bcrypt internally)
- Session management
- Email verification

This module only verifies Clerk session JWTs on the backend.
"""

from __future__ import annotations

import json
import time
from base64 import urlsafe_b64decode
from typing import Any
from urllib.parse import urlparse

import httpx
import structlog

from app.core.config import settings

log = structlog.get_logger()

# ── JWKS cache ────────────────────────────────────────────────
_jwks_cache: dict[str, Any] = {}
_jwks_cache_time: float = 0
_JWKS_TTL = 3600  # 1 hour

_CLERK_JWKS_URL = "https://api.clerk.com/v1/jwks"
_CLERK_USER_URL = "https://api.clerk.com/v1/users"


async def _get_jwks() -> dict:
    """Fetch and cache Clerk's JSON Web Key Set."""
    global _jwks_cache, _jwks_cache_time

    now = time.monotonic()
    if _jwks_cache and (now - _jwks_cache_time) < _JWKS_TTL:
        return _jwks_cache

    if not settings.CLERK_SECRET_KEY:
        return {}

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                _CLERK_JWKS_URL,
                headers={"Authorization": f"Bearer {settings.CLERK_SECRET_KEY}"},
            )
            resp.raise_for_status()
            _jwks_cache = resp.json()
            _jwks_cache_time = now
            return _jwks_cache
    except Exception as e:
        log.warning("clerk.jwks.fetch_failed", error=str(e))
        return _jwks_cache  # Return stale cache if available


def _b64url_decode(data: str) -> bytes:
    """Decode base64url-encoded data."""
    padding = 4 - len(data) % 4
    if padding != 4:
        data += "=" * padding
    return urlsafe_b64decode(data)


async def verify_clerk_token(token: str) -> dict | None:
    """Verify a Clerk session JWT and return the decoded claims.

    Returns dict with at minimum:
      - sub: the Clerk user ID
      - exp: expiration timestamp

    Returns None if the token is invalid or expired. There is deliberately no
    "decode without verification" fallback: python-jose is a hard dependency,
    and unauthenticated decode would make this auth path decorative.
    """
    if not settings.has_clerk:
        return None

    # Fast structural checks before any network work
    parts = token.split(".")
    if len(parts) != 3:
        return None
    try:
        header = json.loads(_b64url_decode(parts[0]))
    except Exception:
        return None
    if header.get("alg") != "RS256" or not header.get("kid"):
        return None

    try:
        from jose import jwt, jwk
    except ImportError:
        log.error("clerk.jwt.python_jose_missing")
        return None

    jwks = await _get_jwks()
    if not jwks:
        return None

    # Build the signing key from JWKS and verify the signature + exp/nbf/iss
    for key_data in jwks.get("keys", []):
        if key_data.get("kid") != header.get("kid"):
            continue
        try:
            signing_key = jwk.construct(key_data)
            claims = jwt.decode(
                token,
                signing_key,
                algorithms=["RS256"],
                options={"verify_aud": False},  # Clerk tokens carry no aud claim
            )
        except Exception:
            continue
        if not claims.get("sub"):
            continue
        iss = claims.get("iss") or ""
        if iss and not _issuer_allowed(iss):
            continue
        return claims
    return None


def _issuer_allowed(iss: str) -> bool:
    """True when `iss` is a Clerk session issuer we accept.

    The check is on the parsed hostname, not the raw string. Substring matching
    (``"clerk.com" in iss``) accepted any host that merely *contains* the
    name — ``https://clerk.com.attacker.tld`` passed, which is exactly the
    token forgery the issuer check exists to prevent.

    Accepted by default: Clerk's own instance domains
    (``<slug>.clerk.accounts.dev``) and Clerk-managed production domains
    (``<slug>.clerk.com``). A ``CLERK_ISSUER`` setting pins a custom domain
    exactly, and then nothing else is accepted.
    """
    try:
        parsed = urlparse(iss)
    except ValueError:
        return False
    if parsed.scheme != "https" or not parsed.hostname:
        return False

    host = parsed.hostname.lower()
    configured = (settings.CLERK_ISSUER or "").strip().rstrip("/").lower()
    if configured:
        return iss.strip().rstrip("/").lower() == configured

    if host == "clerk.accounts.dev" or host.endswith(".clerk.accounts.dev"):
        return True
    return host == "clerk.com" or host.endswith(".clerk.com")


async def clerk_get_user(user_id: str) -> dict | None:
    """Fetch a user object from Clerk's Backend API."""
    if not settings.CLERK_SECRET_KEY:
        return None

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{_CLERK_USER_URL}/{user_id}",
                headers={"Authorization": f"Bearer {settings.CLERK_SECRET_KEY}"},
            )
            if resp.status_code == 200:
                return resp.json()
            return None
    except Exception as e:
        log.warning("clerk.user.fetch_failed", user_id=user_id, error=str(e))
        return None


async def clerk_revoke_session(user_id: str, session_id: str) -> bool:
    """Revoke a Clerk session server-side. Returns True when revoked."""
    if not settings.CLERK_SECRET_KEY or not session_id:
        return False

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{_CLERK_USER_URL}/{user_id}/sessions/{session_id}/revoke",
                headers={"Authorization": f"Bearer {settings.CLERK_SECRET_KEY}"},
            )
            if resp.status_code in (200, 201):
                return True
            log.warning("clerk.session.revoke_failed", status=resp.status_code)
            return False
    except Exception as e:
        log.warning("clerk.session.revoke_error", error=str(e))
        return False
