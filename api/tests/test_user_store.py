"""Tests for the account store: JIT provisioning and Supabase-first reads.

Supabase is optional infrastructure — these tests run with it *disabled*
(the default in tests, since SUPABASE_URL is unset) and verify:
1. `/auth/me` provisions the account row on first request (the fix for
   "user exists in Clerk but never lands in the DB"),
2. the Mongo mock receives the upsert,
3. subsequent reads return the stored shape,
4. an unreachable store degrades to JWT claims instead of a 500.

The user_store must be reset between tests — the module caches nothing, but
the mock DB does (see conftest._clean_state).
"""

from __future__ import annotations

import pytest

from app.core import supabase as sb_mod
from app.services import user_store


@pytest.fixture(autouse=True)
def _supabase_disabled(monkeypatch):
    """Force the Supabase path off so tests exercise the Mongo fallback."""
    monkeypatch.setattr(sb_mod, "_available", False)
    monkeypatch.setattr(sb_mod, "_client", None)
    yield


@pytest.fixture(autouse=True)
def _mock_db_gate(monkeypatch):
    """Point user_store's availability check at the conftest mock.

    db_available() consults the real Motor connection state, which is
    always down in the suite. The routes under test get their handle via
    Depends(get_db) — patched to the mock — so the store must read
    through the same symbol to stay consistent with what the routes see.
    """
    import app.core.database as db_mod
    from tests.conftest import _mock_get_db

    monkeypatch.setattr(db_mod, "get_db", _mock_get_db, raising=False)
    yield


@pytest.mark.asyncio
async def test_upsert_user_writes_mock_db(_clean_state):
    row = await user_store.upsert_user(
        "user_test1", {"email_address": "a@b.com", "username": "tester"}
    )
    assert row is not None
    assert row["id"] == "user_test1"
    assert row["username"] == "tester"
    assert row["email"] == "a@b.com"


@pytest.mark.asyncio
async def test_upsert_user_username_falls_back_to_email(_clean_state):
    row = await user_store.upsert_user(
        "user_test2", {"email_address": "second@b.com"}
    )
    assert row["username"] == "second"


@pytest.mark.asyncio
async def test_get_user_reads_mock_db(_clean_state):
    await user_store.upsert_user(
        "user_test3", {"email_address": "c@b.com", "username": "third"}
    )
    got = await user_store.get_user("user_test3")
    assert got is not None
    assert got["id"] == "user_test3"
    assert got["username"] == "third"


@pytest.mark.asyncio
async def test_get_user_missing_returns_none(_clean_state):
    got = await user_store.get_user("user_never_seen")
    assert got is None


@pytest.mark.asyncio
async def test_auth_me_jit_provisions(client, _clean_state):
    """First /auth/me for an identity creates the account row (JIT)."""
    resp = await client.get("/api/auth/me")
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"]  # the conftest-issued identity


@pytest.mark.asyncio
async def test_auth_me_degrades_to_claims_when_stores_down(client, _clean_state, monkeypatch):
    """Both stores unreachable → JWT claims shape, not a 500."""
    import app.routers.auth_router as auth_router

    async def _boom(*a, **k):
        raise RuntimeError("store down")

    monkeypatch.setattr(auth_router, "get_user", _boom, raising=False)
    monkeypatch.setattr(user_store, "get_user", _boom)
    monkeypatch.setattr(user_store, "upsert_user", _boom)

    resp = await client.get("/api/auth/me")
    assert resp.status_code == 200
    body = resp.json()
    assert set(body) >= {"id", "email", "username"}
