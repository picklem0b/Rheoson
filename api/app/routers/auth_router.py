"""Authentication routes — profile, preferences and the visitor counter.

Credentials belong to Clerk. The client signs in through Clerk's own hosted
components, which verify the password (and any email/phone or MFA challenge)
before a session exists. This router deliberately exposes **no** login or
registration proxy: Clerk's Backend API can mint a session for a user id
without any credential check, so such a route would let knowing an email
address replace knowing the password.

Everything here requires a verified Clerk session, except the public visitor
counter the landing page renders. Account creation is observed through the
Clerk webhook (see clerk_webhook_router), which is also what feeds that
counter.
"""

from __future__ import annotations

from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.core.auth import clerk_revoke_session
from app.core.database import get_db, db_available
from app.core.deps import get_current_user, get_optional_user
from app.core import error_codes

log = structlog.get_logger()

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────

class UpdateProfileRequest(BaseModel):
    """The one editable profile field.

    Identity is a username — there is no first/last name in this product. It is
    validated server-side rather than trusted: it becomes the display name and
    the future messaging handle, so it is confined to a URL-free charset and a
    bounded length. Clerk owns uniqueness; this owns shape.
    """
    username: str | None = Field(
        None, min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_.]+$"
    )


class PreferencesRequest(BaseModel):
    """A partial patch of device-independent preferences.

    The whitelist lives in services/preferences.py; unknown keys are dropped
    rather than rejected so a client that ships a newer toggle than this
    server understands does not have its whole patch refused.
    """
    preferences: dict = {}


# ── Routes ────────────────────────────────────────────────────

@router.post("/logout")
async def logout(user: dict = Depends(get_current_user)):
    """Revoke the Clerk session so the JWT dies server-side, not just locally."""
    await clerk_revoke_session(user.get("sub", ""), user.get("sid", ""))
    return {"ok": True}


@router.get("/me")
async def get_profile(user: dict = Depends(get_current_user)):
    """Get the current user's profile from Clerk."""
    clerk_id = user.get("sub", "")

    # Try to get extended profile from MongoDB
    if db_available():
        try:
            from app.core.database import get_db as _get_db
            db = _get_db()
            mongo_user = await db.users.find_one({"_id": clerk_id})
            if mongo_user:
                return {
                    "id": clerk_id,
                    "email": mongo_user.get("email", user.get("email_address", "")),
                    "username": mongo_user.get("username", ""),
                    "image_url": mongo_user.get("image_url", ""),
                    "created_at": mongo_user.get("created_at"),
                }
        except Exception as e:  # noqa: BLE001 — Clerk claims are the fallback
            # The profile silently degrades to token claims here, which drop
            # the stored username and image. Worth a trace so "my username
            # vanished" has a diagnosable cause instead of being mysterious.
            log.debug("auth.me.mongo_profile_failed", error=str(e))

    # Fallback to Clerk claims
    return {
        "id": clerk_id,
        "email": user.get("email_address", ""),
        "username": user.get("username", ""),
        "image_url": "",
    }


@router.patch("/me")
async def update_profile(
    body: UpdateProfileRequest,
    user: dict = Depends(get_current_user),
):
    """Update user profile in MongoDB."""
    clerk_id = user.get("sub", "")

    if not db_available():
        raise error_codes.fail(error_codes.LIBRARY.DB_UNAVAILABLE, 503)

    from app.core.database import get_db as _get_db
    db = _get_db()

    updates: dict = {"updated_at": datetime.now(timezone.utc)}
    if body.username is not None:
        updates["username"] = body.username

    await db.users.update_one({"_id": clerk_id}, {"$set": updates})
    return {"ok": True}


# ── Per-user preferences ──────────────────────────────────────

def _optional_db():
    """Database handle that degrades to None instead of raising.

    Production's get_db raises 503 when Mongo is down; the test suite
    patches get_db with a mock that returns a database unconditionally.
    Routing both through this helper keeps the graceful-degradation
    contract testable: tests exercise the real merge logic, and a Mongo
    outage in production still serves defaults instead of erroring.
    """
    try:
        return get_db()
    except HTTPException:
        return None


@router.get("/me/preferences")
async def get_preferences_route(user: dict = Depends(get_current_user)):
    """The signed-in user's synced preferences, with defaults filled in."""
    from app.services import preferences as prefs_service

    db = _optional_db()
    return {
        "preferences": await prefs_service.get_preferences(db, user["sub"]),
        "synced": db is not None,
    }


@router.get("/me/preferences/defaults")
async def get_preference_defaults():
    """The server's whitelist and default values.

    The client imports this shape on boot instead of hardcoding its own
    copy, so a new toggle added server-side is picked up by older clients
    without a redeploy.
    """
    from app.services import preferences as prefs_service

    return {"defaults": prefs_service.DEFAULTS}


@router.put("/me/preferences")
async def update_preferences_route(
    body: PreferencesRequest,
    user: dict = Depends(get_current_user),
):
    """Merge a patch into the user's synced preferences and return the result."""
    from app.services import preferences as prefs_service

    db = _optional_db()
    if db is None:
        raise error_codes.fail(
        error_codes.SETTINGS.PREFS_DB_UNAVAILABLE,
        503,
        append=" locally on this device",
    )

    prefs = await prefs_service.update_preferences(db, user["sub"], body.preferences)
    return {"preferences": prefs, "synced": True}


# ── Visitor Counter ───────────────────────────────────────────

@router.get("/visitor-count")
async def visitor_count(
    db: AsyncIOMotorDatabase = Depends(get_db),
    _user: dict | None = Depends(get_optional_user),
):
    """Visitor totals. Public: the landing-page counter renders for guests."""
    doc = await db.visitors.find_one({"_id": "counter"})
    if not doc:
        return {"authed": 0, "total": 0}
    authed = doc.get("authed", 0)
    return {"authed": authed, "total": authed}
