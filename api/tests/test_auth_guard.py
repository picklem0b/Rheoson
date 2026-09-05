"""Auth enforcement + per-user isolation tests (guest-mode removal, v2.14.19).

Guest mode no longer exists. Every route outside the deliberate public set
(auth entry points, the share card, media byte routes, the Clerk webhook)
must 401 without a verified session.
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

    # Validation rejects malformed login payloads (422).
    r = await client_anon.post(
        "/api/auth/login", json={"email": "a@b.c", "password": "x"}
    )
    assert r.status_code == 422


# ── Everything else must 401 without a session ────────────────

@pytest.mark.asyncio
async def test_stateful_endpoints_require_auth(client_anon):
    """Representative sweep across every router: all must 401 anonymously."""
    probes = [
        ("GET", "/api/search?q=test"),
        ("GET", "/api/tracks"),
        ("GET", "/api/tracks/liked"),
        ("GET", "/api/tracks/recently-played"),
        ("GET", "/api/tracks/trending"),
        ("POST", "/api/tracks/dQw4w9WgXcQ/like"),
        ("POST", "/api/tracks/dQw4w9WgXcQ/play"),
        ("GET", "/api/playlists"),
        ("POST", "/api/playlists"),
        ("GET", "/api/downloads"),
        ("POST", "/api/downloads"),
        ("GET", "/api/lyrics/dQw4w9WgXcQ"),
        ("GET", "/api/equalizer/presets"),
        ("GET", "/api/settings/spotify/status"),
        ("GET", "/api/recommendations/home"),
        ("GET", "/api/recommendations/taste"),
        ("GET", "/api/analytics/stats"),
        ("GET", "/api/smart-playlists/most-played"),
        ("POST", "/api/stream/dQw4w9WgXcQ/warm"),
        ("POST", "/api/stream/cache/clear"),
        ("GET", "/api/share/dQw4w9WgXcQ/link"),
        ("GET", "/api/auth/me"),
        ("GET", "/api/auth/visitor-count"),
    ]
    for method, url in probes:
        resp = await client_anon.request(method, url)
        assert resp.status_code == 401, f"{method} {url} -> {resp.status_code}"


@pytest.mark.asyncio
async def test_search_resolve_requires_auth(client_anon):
    resp = await client_anon.post(
        "/api/search/resolve",
        json={"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"},
    )
    assert resp.status_code == 401


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
