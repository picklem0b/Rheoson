"""The account identity contract.

Identity is a single **username** — this product has no first/last name, so no
route or document should carry one. The username is the display name and the
handle a future messaging feature will address people by, which is why its
shape is validated server-side rather than trusted from the client.

Sign-in itself is Clerk's: the password (and any email/phone challenge) is
verified before a session exists, by Clerk's own components.
"""

from __future__ import annotations

import pytest

from tests.conftest import TEST_USER_SUB


# ── Sign-up carries a username, nothing else ──────────────────

@pytest.mark.asyncio
async def test_webhook_records_a_username_and_no_name(monkeypatch):
    from app.core.database import get_db
    import app.routers.clerk_webhook_router as wh

    monkeypatch.setattr(wh, "db_available", lambda: True)
    db = get_db()

    await wh._handle_user_created({
        "id": "user_u1",
        "username": "dj_flow",
        # Clerk may still send these; they must not be persisted as identity.
        "first_name": "Should",
        "last_name": "BeIgnored",
        "email_addresses": [{"id": "e1", "email_address": "a@b.c"}],
        "primary_email_address_id": "e1",
    })

    doc = await db.users.find_one({"_id": "user_u1"})
    assert doc["username"] == "dj_flow"
    for stale in ("name", "first_name", "last_name"):
        assert stale not in doc, f"{stale} is not part of this product's identity"


@pytest.mark.asyncio
async def test_webhook_falls_back_to_the_email_local_part(monkeypatch):
    """Accounts predating the required username must still get an identity."""
    from app.core.database import get_db
    import app.routers.clerk_webhook_router as wh

    monkeypatch.setattr(wh, "db_available", lambda: True)
    db = get_db()

    await wh._handle_user_created({
        "id": "user_u2",
        "email_addresses": [{"id": "e1", "email_address": "listener@b.c"}],
        "primary_email_address_id": "e1",
    })

    doc = await db.users.find_one({"_id": "user_u2"})
    assert doc["username"] == "listener"


@pytest.mark.asyncio
async def test_username_update_is_recorded(monkeypatch):
    from app.core.database import get_db
    import app.routers.clerk_webhook_router as wh

    monkeypatch.setattr(wh, "db_available", lambda: True)
    db = get_db()
    await db.users.insert_one({"_id": "user_u3", "username": "old_handle"})

    await wh._handle_user_updated({"id": "user_u3", "username": "new_handle"})

    doc = await db.users.find_one({"_id": "user_u3"})
    assert doc["username"] == "new_handle"


# ── The username is validated, not trusted ────────────────────

@pytest.mark.asyncio
async def test_profile_username_shape_is_enforced(client, monkeypatch):
    """It becomes a handle, so the charset is constrained server-side."""
    from app.core.database import get_db

    # The suite runs without a real database; the profile routes treat that as
    # 503. Patch the module-level check so the write path is exercised.
    monkeypatch.setattr("app.routers.auth_router.db_available", lambda: True)

    db = get_db()
    await db.users.insert_one(
        {"_id": TEST_USER_SUB, "email": "test@rheoson.test", "username": "initial"}
    )

    for bad in ("ab", "has space", "bad/slash", "x" * 33, "", "<script>"):
        r = await client.patch("/api/auth/me", json={"username": bad})
        assert r.status_code == 422, f"{bad!r} was accepted ({r.status_code})"

    r = await client.patch("/api/auth/me", json={"username": "dj_flow"})
    assert r.status_code == 200, r.text

    me = await client.get("/api/auth/me")
    assert me.status_code == 200
    body = me.json()
    assert body["username"] == "dj_flow"
    assert "name" not in body
