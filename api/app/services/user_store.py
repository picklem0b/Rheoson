"""User store — account persistence with Supabase-first, Mongo fallback.

Ownership: accounts (identity rows) live in Supabase Postgres when
configured; Mongo remains the fallback and the home of per-user JSON-like
collections (prefs, signals) until those migrate. Callers never branch on
the backend themselves — they ask this module for upsert/get and get the
same shape back.
"""

from __future__ import annotations

from datetime import datetime, timezone

import structlog

from app.core.config import settings
from app.core.supabase import get_supabase, run_sb

log = structlog.get_logger()

# The subset of columns the app reads/writes on a user row. Extra Clerk
# metadata fields are dropped so a schema change upstream cannot poison
# inserts.
COLUMNS = ("id", "email", "username", "image_url", "created_at", "updated_at")


def _row_from_claims(clerk_id: str, claims: dict) -> dict:
    """Build a user row from a verified Clerk JWT's claims."""
    now = datetime.now(timezone.utc).isoformat()
    username = (claims.get("username") or "").strip()
    if not username:
        email = claims.get("email_address") or ""
        username = email.split("@")[0] if email else clerk_id
    return {
        "id": clerk_id,
        "email": claims.get("email_address") or "",
        "username": username,
        "image_url": "",
        "updated_at": now,
    }


def _clean(row: dict | None) -> dict | None:
    if not row:
        return None
    return {k: row.get(k) for k in COLUMNS if k in row}


async def upsert_user(clerk_id: str, claims: dict) -> dict | None:
    """Create-or-update the account row for a Clerk user (JIT provisioning).

    Called on the first authenticated request — this is what used to be the
    webhook's job, and why a user can now exist in the DB without any
    webhook configuration.
    """
    row = _row_from_claims(clerk_id, claims)
    sb = get_supabase()
    if sb is not None:
        try:
            def _write():
                return (
                    sb.table(settings.SUPABASE_USERS_TABLE)
                    .upsert(row, on_conflict="id")
                    .execute()
                )

            res = await run_sb(_write)
            data = getattr(res, "data", None) or []
            return _clean(data[0]) if data else row
        except Exception as e:  # noqa: BLE001 — fall through to Mongo
            log.error("user_store.supabase_upsert_failed", clerk_id=clerk_id, error=str(e))

    # Mongo fallback. No db_available() gate: get_db() itself raises the
    # canonical 503 when Mongo is down (and in tests returns the patched
    # mock), so a single try/except is the whole availability story.
    try:
        from app.core.database import get_db

        db = get_db()
        now = datetime.now(timezone.utc)
        await db.users.update_one(
            {"_id": clerk_id},
            {
                "$set": {
                    "email": row["email"],
                    "username": row["username"],
                    "clerk_id": clerk_id,
                    "updated_at": now,
                    "deleted_at": None,
                },
                "$setOnInsert": {"created_at": now},
            },
            upsert=True,
        )
        return row
    except Exception as e:  # noqa: BLE001
        log.error("user_store.mongo_upsert_failed", clerk_id=clerk_id, error=str(e))

    return None


async def get_user(clerk_id: str) -> dict | None:
    """Fetch one account row, Supabase-first."""
    sb = get_supabase()
    if sb is not None:
        try:
            def _read():
                return (
                    sb.table(settings.SUPABASE_USERS_TABLE)
                    .select("*")
                    .eq("id", clerk_id)
                    .limit(1)
                    .execute()
                )

            res = await run_sb(_read)
            data = getattr(res, "data", None) or []
            if data:
                return _clean(data[0])
        except Exception as e:  # noqa: BLE001
            log.error("user_store.supabase_get_failed", clerk_id=clerk_id, error=str(e))

    try:
        from app.core.database import get_db

        db = get_db()
        doc = await db.users.find_one({"_id": clerk_id})
        if doc:
            return {
                "id": doc.get("_id"),
                "email": doc.get("email", ""),
                "username": doc.get("username", ""),
                "image_url": doc.get("image_url", ""),
                "created_at": doc.get("created_at"),
            }
    except Exception as e:  # noqa: BLE001
        log.error("user_store.mongo_get_failed", clerk_id=clerk_id, error=str(e))

    return None
