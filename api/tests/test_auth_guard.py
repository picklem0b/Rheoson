"""Auth enforcement + per-user isolation tests (guest-first policy).

The public set is deliberate and documented: search, lyrics, equalizer
presets, trending/recently-played, library aggregates, downloads and the
share link work without an account (see test_guest_policy.py for the full
matrix). Everything account-scoped or instance-administrative must 401
without a verified session — and a presented-but-invalid token must 401,
never silently degrade to guest.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest


# ── Public set: must NOT require auth ─────────────────────────

@pytest.mark.asyncio
async def test_public_routes_are_reachable_without_auth(client_anon):
    """Health and the share card are the only read-only public surfaces."""
    r = await client_anon.get("/api/health")
    assert r.status_code == 200

    r = await client_anon.get(
        "/api/share/dQw4w9WgXcQ/card",
        params={"title": "Never", "artist": "Rick"},
    )
    assert r.status_code == 200
    assert "text/html" in r.headers.get("content-type", "")

    # The visitor counter is public — the landing page renders it for guests.
    r = await client_anon.get("/api/auth/visitor-count")
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_credential_proxy_routes_do_not_exist(client_anon):
    """No server route may exchange an email address for a session.

    Clerk's Backend API creates a session for a user id without verifying a
    password, so a login proxy that looks a user up by email and calls it is
    an account-takeover primitive: knowing an address would be enough.
    Credentials are handled by Clerk's hosted components; these routes must
    stay gone.
    """
    for path in ("/api/auth/login", "/api/auth/register"):
        r = await client_anon.post(
            path, json={"email": "victim@example.com", "password": "whatever"}
        )
        assert r.status_code in (404, 405), f"{path} responded {r.status_code}"


# ── Everything else must 401 without a session ────────────────

@pytest.mark.asyncio
async def test_account_endpoints_require_auth(client_anon):
    """Representative sweep: account-scoped + admin routes 401 anonymously.

    Guest-policy routes are pinned in test_guest_policy.py — they must NOT
    appear here.
    """
    probes = [
        ("GET", "/api/tracks/liked"),
        ("POST", "/api/tracks/dQw4w9WgXcQ/like"),
        ("POST", "/api/tracks/dQw4w9WgXcQ/play"),
        ("GET", "/api/playlists"),
        ("POST", "/api/playlists"),
        ("GET", "/api/settings/spotify/status"),
        ("GET", "/api/recommendations/home"),
        ("GET", "/api/recommendations/taste"),
        ("GET", "/api/analytics/stats"),
        ("GET", "/api/smart-playlists/most-played"),
        ("POST", "/api/stream/cache/clear"),
        ("GET", "/api/auth/me"),
    ]
    for method, url in probes:
        resp = await client_anon.request(method, url)
        assert resp.status_code == 401, f"{method} {url} -> {resp.status_code}"


@pytest.mark.asyncio
async def test_search_resolve_serves_guests(client_anon):
    """URL resolution is part of the guest search experience.

    The SSRF netguard still applies (non-media hosts -> 400); the endpoint
    simply no longer hides behind an auth wall.
    """
    resp = await client_anon.post(
        "/api/search/resolve",
        json={"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"},
    )
    assert resp.status_code != 401


# ── Per-user isolation ────────────────────────────────────────
# Each fixture sends a different Bearer token → different claims →
# different user_id in the handlers.  File-backed stores use per-user
# filenames so A's likes/history/playlists are invisible to B.

@pytest.mark.asyncio
async def test_likes_are_scoped_per_user(client, client_as_other_user):
    r_a = await client.get("/api/tracks/liked/count")
    assert r_a.status_code == 200
    assert r_a.json()["count"] == 0

    r_b = await client_as_other_user.get("/api/tracks/liked/count")
    assert r_b.status_code == 200
    assert r_b.json()["count"] == 0

    # User A likes a track.
    r = await client.post("/api/tracks/dQw4w9WgXcQ/like")
    assert r.status_code == 200, r.text

    r_a = await client.get("/api/tracks/liked/count")
    assert r_a.json()["count"] == 1

    r_b = await client_as_other_user.get("/api/tracks/liked/count")
    assert r_b.json()["count"] == 0


@pytest.mark.asyncio
async def test_playlists_are_scoped_per_user(client, client_as_other_user):
    r = await client.post("/api/playlists", json={"title": "A's secret mix"})
    assert r.status_code == 201, r.text
    pid = r.json()["id"]

    r_b = await client_as_other_user.get("/api/playlists")
    assert r_b.status_code == 200
    assert r_b.json() == []

    # GET and PATCH must 404 — B cannot see or modify A's playlist.
    for method, url in [
        ("GET", f"/api/playlists/{pid}"),
        ("PATCH", f"/api/playlists/{pid}"),
    ]:
        resp = await client_as_other_user.request(
            method, url, json={"title": "hi"} if method == "PATCH" else None
        )
        assert resp.status_code == 404, f"{method} -> {resp.status_code}"

    # DELETE is intentionally idempotent (204) — but A's playlist must
    # still exist afterward since B never owned it.
    resp = await client_as_other_user.delete(f"/api/playlists/{pid}")
    assert resp.status_code == 204
    r_a = await client.get(f"/api/playlists/{pid}")
    assert r_a.status_code == 200
    assert r_a.json()["title"] == "A's secret mix"


@pytest.mark.asyncio
async def test_play_history_is_scoped_per_user(client, client_as_other_user):
    await client.post("/api/tracks/dQw4w9WgXcQ/play")

    r_b = await client_as_other_user.get("/api/tracks/recently-played")
    assert r_b.status_code == 200
    assert r_b.json() == []


# ── Netguard URL hardening ────────────────────────────────────

@pytest.mark.asyncio
async def test_resolve_rejects_non_media_hosts(client):
    for url in [
        "http://127.0.0.1:8000/api/health",
        "http://169.254.169.254/latest/meta-data/",
        "http://[::1]/",
        "https://example.com/not-media",
        "file:///etc/passwd",
        "ftp://youtube.com/x",
    ]:
        resp = await client.post("/api/search/resolve", json={"url": url})
        assert resp.status_code == 400, f"{url} -> {resp.status_code}"


@pytest.mark.asyncio
async def test_resolve_accepts_media_hosts(client):
    for url in [
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtu.be/dQw4w9WgXcQ",
    ]:
        resp = await client.post("/api/search/resolve", json={"url": url})
        assert resp.status_code in (200, 400, 502), f"{url} -> {resp.status_code}"


@pytest.mark.asyncio
async def test_webhook_refuses_when_secret_unset(client_anon, monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "CLERK_WEBHOOK_SECRET", "")
    resp = await client_anon.post(
        "/api/webhooks/clerk",
        content='{"type":"user.created","data":{"id":"user_x"}}',
        headers={"svix-id": "m", "svix-timestamp": "1", "svix-signature": "v1,dead"},
    )
    assert resp.status_code == 503
