"""Clerk Webhook Router

Receives webhook events from Clerk and syncs user data to MongoDB.

Clerk sends events as JSON POST requests with a Svix signature in the
`svix-id`, `svix-timestamp`, and `svix-signature` headers. This module
verifies those signatures using HMAC-SHA256 to ensure the payload
actually came from Clerk.

Events handled:
  - user.created  → upsert user in MongoDB
  - user.updated  → update user in MongoDB
  - user.deleted  → soft-delete (mark deleted_at) or remove user from MongoDB

The webhook endpoint is registered WITHOUT auth dependencies — Clerk
does not send Bearer tokens. Security comes from signature verification.

Setup:
  1. In Clerk Dashboard → Webhooks → add endpoint: https://your-api.com/api/webhooks/clerk
  2. Copy the Signing Secret and set CLERK_WEBHOOK_SECRET in your .env
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Request

from app.core.config import settings
from app.core.database import db_available
from app.core import error_codes

router = APIRouter()
log = structlog.get_logger()

# ── Signature verification ─────────────────────────────────────


def _verify_svix_signature(
    payload: bytes,
    svix_id: str,
    svix_timestamp: str,
    svix_signature: str,
    secret: str,
) -> bool:
    """Verify the Svix HMAC-SHA256 signature on a Clerk webhook.

    The signed content is `"{svix_id}.{svix_timestamp}.{body}"`.
    The secret is base64-encoded; we strip the `whsec_` prefix and
    decode before HMAC comparison.

    Returns True if the signature is valid.
    """
    # Clerk signing secrets start with "whsec_"
    if secret.startswith("whsec_"):
        secret = secret[6:]

    # Decode the base64 secret
    import base64
    try:
        key = base64.b64decode(secret)
    except Exception:
        key = secret.encode("utf-8")

    # Build the signed content
    to_sign = f"{svix_id}.{svix_timestamp}.{payload.decode('utf-8')}"

    # Compute HMAC-SHA256
    expected = hmac.new(key, to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

    # Compare each signature (Svix can send multiple, space-separated). Each
    # entry looks like "v1,<hexsig>" — splitting on ',' (not ':') matches the
    # real Svix header format; splitting on ':' never matched anything, so
    # every Clerk webhook was rejected as invalid.
    for sig in svix_signature.split(" "):
        sig = sig.strip()
        if not sig:
            continue
        if "," in sig:
            _version, sig_value = sig.split(",", 1)
        else:
            sig_value = sig

        if hmac.compare_digest(expected, sig_value):
            return True

    return False


def _check_timestamp(svix_timestamp: str, max_age_seconds: int = 300) -> bool:
    """Reject webhooks with timestamps older than max_age_seconds (5 min default)."""
    try:
        ts = int(svix_timestamp)
        now = int(time.time())
        return abs(now - ts) <= max_age_seconds
    except (ValueError, TypeError):
        return False


# ── Replay protection ──────────────────────────────────────────

async def _claim_event(svix_id: str) -> bool:
    """Reserve a delivery id; False when this event was already handled.

    Svix retries any delivery it believes failed, so the same event can arrive
    more than once — and a verified signature does not make a replay harmless.
    Recording the delivery id and relying on `_id` uniqueness makes the second
    arrival a no-op instead of a second `user.created` running the handler.

    When the database is unreachable the event is accepted rather than dropped:
    every handler here is written to be idempotent, so a duplicate is far less
    harmful than losing the event entirely.
    """
    try:
        from app.core.database import get_db, db_available
        if not db_available():
            return True
        await get_db().webhook_events.insert_one(
            {"_id": svix_id, "received_at": datetime.now(timezone.utc)}
        )
        return True
    except Exception as e:  # noqa: BLE001 — the claim must not 500 the webhook
        message = str(e)
        if "E11000" in message or "duplicate key" in message.lower():
            log.info("webhook.clerk.replay_ignored", svix_id=svix_id)
            return False
        log.warning("webhook.clerk.claim_failed", svix_id=svix_id, error=message[:200])
        return True


# ── Event handlers ─────────────────────────────────────────────


async def _count_new_account(db) -> None:
    """Increment the public account counter for one newly created user.

    The landing page renders this counter, and it is only meaningful if it
    moves once per account. It is incremented here — inside the
    ``user.created`` handler, gated on the upsert actually inserting — rather
    than on a sign-in, which would count every login as a new visitor.
    """
    try:
        await db.visitors.update_one(
            {"_id": "counter"},
            {
                "$inc": {"authed": 1, "total": 1},
                "$set": {"updated_at": datetime.now(timezone.utc)},
            },
            upsert=True,
        )
    except Exception:
        pass  # Non-critical: the counter must never fail account creation


async def _handle_user_created(data: dict) -> None:
    """Upsert a newly created Clerk user into MongoDB."""
    if not db_available():
        return

    clerk_id = data.get("id", "")
    if not clerk_id:
        return

    # Extract email (Clerk stores emails as a list of objects)
    emails = data.get("email_addresses", [])
    primary_email = ""
    for e in emails:
        if e.get("id") == data.get("primary_email_address_id"):
            primary_email = e.get("email_address", "")
            break
    if not primary_email and emails:
        primary_email = emails[0].get("email_address", "")

    # Identity is the username alone — this product has no first/last name.
    # Clerk enforces uniqueness at sign-up; the email local part is only a
    # fallback for accounts that predate the field being required.
    username = (data.get("username") or "").strip() or primary_email.split("@")[0] or clerk_id

    # Profile image
    image_url = data.get("image_url", "")

    now = datetime.now(timezone.utc)

    try:
        from app.core.database import get_db
        db = get_db()

        result = await db.users.update_one(
            {"_id": clerk_id},
            {
                "$set": {
                    "email": primary_email,
                    "username": username,
                    "image_url": image_url,
                    "clerk_id": clerk_id,
                    "updated_at": now,
                    "deleted_at": None,  # Un-soft-delete if re-created
                },
                "$setOnInsert": {
                    "created_at": now,
                    "preferences": {
                        "audio_format": "mp3",
                        "audio_quality": "0",
                        "theme": "dark",
                    },
                    "stats": {
                        "total_plays": 0,
                        "total_downloads": 0,
                        "minutes_listened": 0,
                    },
                },
            },
            upsert=True,
        )
        if getattr(result, "upserted_id", None) is not None:
            await _count_new_account(db)
        log.info("webhook.clerk.user_created", clerk_id=clerk_id, email=primary_email)
    except Exception as e:
        log.error("webhook.clerk.user_created.failed", clerk_id=clerk_id, error=str(e))


async def _handle_user_updated(data: dict) -> None:
    """Update user fields in MongoDB when Clerk profile changes."""
    if not db_available():
        return

    clerk_id = data.get("id", "")
    if not clerk_id:
        return

    # Extract updated fields
    emails = data.get("email_addresses", [])
    primary_email = ""
    for e in emails:
        if e.get("id") == data.get("primary_email_address_id"):
            primary_email = e.get("email_address", "")
            break
    if not primary_email and emails:
        primary_email = emails[0].get("email_address", "")

    username = (data.get("username") or "").strip()
    image_url = data.get("image_url", "")

    updates: dict = {
        "updated_at": datetime.now(timezone.utc),
    }
    if primary_email:
        updates["email"] = primary_email
    if username:
        updates["username"] = username
    if image_url:
        updates["image_url"] = image_url

    try:
        from app.core.database import get_db
        db = get_db()

        result = await db.users.update_one(
            {"_id": clerk_id},
            {"$set": updates},
        )
        log.info(
            "webhook.clerk.user_updated",
            clerk_id=clerk_id,
            modified=result.modified_count,
        )
    except Exception as e:
        log.error("webhook.clerk.user_updated.failed", clerk_id=clerk_id, error=str(e))


async def _handle_user_deleted(data: dict) -> None:
    """Handle user deletion from Clerk.

    We soft-delete by setting deleted_at rather than removing the document,
    because the user may have playlists, liked tracks, and play history
    associated with their account. A hard delete can be done via a
    separate maintenance job.
    """
    if not db_available():
        return

    clerk_id = data.get("id", "")
    if not clerk_id:
        return

    now = datetime.now(timezone.utc)

    try:
        from app.core.database import get_db
        db = get_db()

        result = await db.users.update_one(
            {"_id": clerk_id},
            {"$set": {"deleted_at": now, "updated_at": now}},
        )
        log.info(
            "webhook.clerk.user_deleted",
            clerk_id=clerk_id,
            modified=result.modified_count,
        )
    except Exception as e:
        log.error("webhook.clerk.user_deleted.failed", clerk_id=clerk_id, error=str(e))


async def _handle_session_created(data: dict) -> None:
    """Track session creation — update last_active_at on the user."""
    if not db_available():
        return

    user_id = data.get("user_id", "")
    if not user_id:
        return

    try:
        from app.core.database import get_db
        db = get_db()

        await db.users.update_one(
            {"_id": user_id},
            {
                "$set": {
                    "last_active_at": datetime.now(timezone.utc),
                    "last_session_id": data.get("id", ""),
                },
            },
        )
    except Exception:
        pass  # Non-critical


# ── Route ──────────────────────────────────────────────────────


@router.post("/webhooks/clerk")
async def clerk_webhook(request: Request):
    """Receive and process Clerk webhook events.

    This endpoint:
    1. Reads raw body for signature verification
    2. Verifies the Svix HMAC-SHA256 signature
    3. Checks timestamp freshness (5-minute window)
    4. Dispatches to the appropriate event handler
    5. Returns 200 quickly — processing is best-effort
    """
    # ── Read raw body ──
    body = await request.body()

    # ── Verify webhook secret is configured ──
    if not settings.CLERK_WEBHOOK_SECRET:
        # Without a signing secret every webhook would have to be trusted
        # on faith — anyone could POST forged user.created events. Refuse
        # to run unverified in ALL environments (not just production).
        log.warning("webhook.clerk.no_secret", note="CLERK_WEBHOOK_SECRET not configured — rejecting webhook")
        raise error_codes.fail(error_codes.WEBHOOK.SECRET_UNCONFIGURED, 503)

    # ── Verify signature ──
    svix_id = request.headers.get("svix-id", "")
    svix_timestamp = request.headers.get("svix-timestamp", "")
    svix_signature = request.headers.get("svix-signature", "")

    if not all([svix_id, svix_timestamp, svix_signature]):
        log.warning("webhook.clerk.missing_headers")
        raise error_codes.fail(error_codes.WEBHOOK.HEADERS_MISSING, 400)

    if not _check_timestamp(svix_timestamp):
        log.warning("webhook.clerk.timestamp_expired", svix_timestamp=svix_timestamp)
        raise error_codes.fail(error_codes.WEBHOOK.TIMESTAMP_EXPIRED, 400)

    if not _verify_svix_signature(
        body, svix_id, svix_timestamp, svix_signature, settings.CLERK_WEBHOOK_SECRET
    ):
        log.warning("webhook.clerk.invalid_signature")
        raise error_codes.fail(error_codes.WEBHOOK.SIGNATURE_INVALID, 403)

    # ── Parse event ──
    try:
        event = json.loads(body)
    except json.JSONDecodeError:
        raise error_codes.fail(error_codes.WEBHOOK.PAYLOAD_INVALID, 400, append=": JSON is malformed")

    event_type = event.get("type", "")
    data = event.get("data", {})

    if not await _claim_event(svix_id):
        return {"ok": True}

    log.info("webhook.clerk.received", event_type=event_type, user_id=data.get("id", ""))

    # ── Dispatch ──
    try:
        match event_type:
            case "user.created":
                await _handle_user_created(data)
            case "user.updated":
                await _handle_user_updated(data)
            case "user.deleted":
                await _handle_user_deleted(data)
            case "session.created":
                await _handle_session_created(data)
            case _:
                log.debug("webhook.clerk.unhandled_event", event_type=event_type)
    except Exception as e:
        # Don't crash the webhook — Clerk will retry, and we log the error
        log.error("webhook.clerk.handler_failed", event_type=event_type, error=str(e))

    # Always return 200 quickly to prevent Clerk retries
    return {"ok": True}
