"""Device-linked guest sessions.

The phone app opens without an account: someone installing the APK should be
able to play the library on first launch instead of being stopped by a sign-in
wall. Clerk cannot represent that — it only issues sessions for accounts that
exist — so this module mints a *guest* identity instead.

The shape matters:

* a guest is a `sub` of its own (`guest_<uuid4>`), scoped exactly like an
  account's: its likes, history, playlists and follows live in the same
  per-user JSON sidecars, and no route can reach another identity's files;
* the token is a plain HS256 JWT signed with a server secret, carries
  `iss = "rheoson:guest"`, and lives for a year — a device keeps its own
  history across restarts, and re-mints only if the token is lost;
* nothing here can act on an existing account. `sub` is generated server-side
  and is never taken from the request, so a guest token can only ever speak for
  the identity the server just created for that device;
* the whole mechanism is switchable off (`ALLOW_GUEST_ACCOUNTS=false`), and
  refuses to mint anything at all when the instance has no secret to sign with
  — an unsigned guest token would be forgeable, which is worse than no guests.

Deliberately *not* here: any way to promote a guest into an account. Linking a
Clerk identity to a guest's data is a migration problem (which side wins, what
happens to both libraries), and guessing at it would be how data gets lost.
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import jwt

from app.core.config import settings

#: Marker so a guest token is never mistaken for a Clerk session, and so the
#: two verification paths can never be confused for one another.
GUEST_ISSUER = "rheoson:guest"

#: Domain namespace for the generated subs. Keeps them visually distinct from
#: Clerk's `user_…` ids in sidecar filenames and logs.
GUEST_SUB_PREFIX = "guest_"


def guests_enabled() -> bool:
    """True when this instance accepts guest sessions at all."""
    return bool(settings.ALLOW_GUEST_ACCOUNTS) and _signing_key() is not None


def _signing_key() -> str | None:
    """The key guest tokens are signed with, or None when none is configured.

    `GUEST_TOKEN_SECRET` is the intended source. Falling back to the Clerk
    secret keeps a self-hosted install that never set it working, since that
    value is already required and already secret; a deployment with neither has
    auth switched off entirely and gets no guests rather than unsigned tokens.
    """
    secret = (settings.GUEST_TOKEN_SECRET or "").strip()
    if not secret:
        secret = (settings.CLERK_SECRET_KEY or "").strip()
    if not secret:
        return None
    # Stretched to a fixed 32 bytes: HMAC-SHA256 says short keys are weak, and
    # a configured secret can be any length. Derivation is deterministic, so
    # tokens minted before a restart keep verifying after it.
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def mint_guest_token(sub: str | None = None) -> tuple[str, str]:
    """Create a guest identity and the token that proves it.

    Returns `(sub, token)`. The caller decides how to present the identity; the
    sub is server-generated unless a caller (a test, or a device resuming after
    a wipe) supplies one that already carries the guest prefix.
    """
    key = _signing_key()
    if key is None:
        raise RuntimeError("no signing key configured for guest sessions")

    if not sub or not sub.startswith(GUEST_SUB_PREFIX):
        sub = f"{GUEST_SUB_PREFIX}{uuid.uuid4()}"

    now = datetime.now(timezone.utc)
    claims: dict[str, Any] = {
        "sub": sub,
        "iss": GUEST_ISSUER,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=max(1, settings.GUEST_TOKEN_TTL_DAYS))).timestamp()),
        "guest": True,
    }
    return sub, jwt.encode(claims, key, algorithm="HS256")


def decode_guest_token(token: str) -> dict[str, Any] | None:
    """Verify a guest token, or return None when it is not one of ours.

    None covers every rejection — wrong issuer, bad signature, expired, a Clerk
    token presented here by mistake — because the caller falls through to Clerk
    verification next and only one of the two paths can ever accept a token.
    """
    key = _signing_key()
    if key is None:
        return None
    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=["HS256"],
            issuer=GUEST_ISSUER,
            options={"require_exp": True, "require_sub": True},
        )
    except Exception:
        return None

    sub = claims.get("sub")
    if not isinstance(sub, str) or not sub.startswith(GUEST_SUB_PREFIX):
        return None
    # Marked explicitly: anything downstream that wants account-only behaviour
    # (profile edits, messaging, backups) can refuse a guest without guessing
    # from the id's shape.
    claims["_guest"] = True
    return claims
