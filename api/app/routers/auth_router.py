"""Authentication routes — Clerk-backed registration, login, profile.

Guest users can access most features. Auth is required for:
- Playlists (creating, editing)
- Downloads
- Recommendations / analytics
- Messaging (future)

The /visitor-count endpoint tracks total guests + authed users for
the landing page display.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr

from app.core.auth import clerk_create_user, clerk_create_session, clerk_get_user
from app.core.database import get_db, db_available
from app.core.deps import get_current_user

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    session_token: str
    user: dict


class UpdateProfileRequest(BaseModel):
    name: str | None = None


# ── Routes ────────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(body: RegisterRequest, db: AsyncIOMotorDatabase = Depends(get_db)):
    """Register a new user via Clerk Backend API."""
    # Create user in Clerk
    clerk_user = await clerk_create_user(
        email=body.email,
        password=body.password,
        name=body.name,
    )
    if clerk_user is None:
        raise HTTPException(status_code=409, detail="Email may already be registered")

    clerk_id = clerk_user["id"]

    # Create a session (returns a JWT)
    session = await clerk_create_session(clerk_id)
    if session is None:
        raise HTTPException(status_code=500, detail="Failed to create session")

    # Get the JWT from the session
    session_token = session.get("last_active_token", {}).get("jwt", "")
    if not session_token:
        raise HTTPException(status_code=500, detail="No session token returned")

    # Store/update user in MongoDB
    now = datetime.now(timezone.utc)
    user_doc = {
        "_id": clerk_id,
        "email": body.email,
        "name": body.name or body.email.split("@")[0],
        "clerk_id": clerk_id,
        "created_at": now,
        "updated_at": now,
    }
    await db.users.update_one(
        {"_id": clerk_id},
        {"$set": user_doc},
        upsert=True,
    )

    # Increment visitor counter
    await _increment_visitor_counter(db, "authed")

    return TokenResponse(
        session_token=session_token,
        user={
            "id": clerk_id,
            "email": body.email,
            "name": user_doc["name"],
        },
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncIOMotorDatabase = Depends(get_db)):
    """Login via Clerk — verify credentials and create session.

    Note: Clerk's Backend API doesn't have a direct "login" endpoint.
    The frontend should use Clerk's signIn.create() to authenticate,
    then pass the resulting session token. This endpoint exists as a
    fallback for API-only authentication.
    """
    # For now, we delegate to Clerk's frontend flow.
    # This endpoint validates that the user exists and creates a session.
    # In practice, the frontend handles login via @clerk/clerk-react.
    raise HTTPException(
        status_code=400,
        detail="Use the sign-in form. This endpoint is for reference only.",
    )


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
                    "name": mongo_user.get("name", ""),
                    "created_at": mongo_user.get("created_at"),
                }
        except Exception:
            pass

    # Fallback to Clerk claims
    return {
        "id": clerk_id,
        "email": user.get("email_address", ""),
        "name": user.get("first_name", ""),
    }


@router.patch("/me")
async def update_profile(
    body: UpdateProfileRequest,
    user: dict = Depends(get_current_user),
):
    """Update user profile in MongoDB."""
    clerk_id = user.get("sub", "")

    if not db_available():
        raise HTTPException(status_code=503, detail="Database not available")

    from app.core.database import get_db as _get_db
    db = _get_db()

    updates: dict = {"updated_at": datetime.now(timezone.utc)}
    if body.name is not None:
        updates["name"] = body.name

    await db.users.update_one({"_id": clerk_id}, {"$set": updates})
    return {"ok": True}


# ── Visitor Counter ───────────────────────────────────────────

async def _increment_visitor_counter(db: AsyncIOMotorDatabase, kind: str) -> None:
    """Increment the visitor counter (guest or authed)."""
    try:
        await db.visitors.update_one(
            {"_id": "counter"},
            {
                "$inc": {kind: 1},
                "$set": {"updated_at": datetime.now(timezone.utc)},
            },
            upsert=True,
        )
    except Exception:
        pass  # Non-critical


@router.post("/guest-visit")
async def record_guest_visit(db: AsyncIOMotorDatabase = Depends(get_db)):
    """Record a guest visit. Called once per session on app load."""
    await _increment_visitor_counter(db, "guests")
    return {"ok": True}


@router.get("/visitor-count")
async def visitor_count(db: AsyncIOMotorDatabase = Depends(get_db)):
    """Get total visitors (guests + authed). For the landing page."""
    doc = await db.visitors.find_one({"_id": "counter"})
    if not doc:
        return {"guests": 0, "authed": 0, "total": 0}
    guests = doc.get("guests", 0)
    authed = doc.get("authed", 0)
    return {"guests": guests, "authed": authed, "total": guests + authed}
