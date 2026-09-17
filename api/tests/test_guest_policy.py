"""Guest-first policy — the matrix every deployment must satisfy.

CLAUDE.md promises: without an account you can search, stream, read lyrics,
browse categories, see trending/recently-played and start downloads. This
suite pins that promise endpoint by endpoint, and pins the other half too:
account features must still refuse anonymous callers, and a *presented but
invalid* token must 401 rather than silently degrade to guest.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app

# ── The matrix ────────────────────────────────────────────────────
# (method, path, json-body-or-None) -> anonymous callers get a real
# response (200/4xx-bytes-not-auth), never an auth wall.

GUEST_ALLOWED = [
    ("GET", "/api/search?q=adele&filter=songs", None),
    ("GET", "/api/search/categories", None),
    ("POST", "/api/search/resolve", {"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}),
    ("GET", "/api/tracks/", None),
    ("GET", "/api/tracks/recently-played", None),
    ("GET", "/api/tracks/trending", None),
    ("GET", "/api/tracks/trending/weekly", None),
    ("GET", "/api/lyrics/dQw4w9WgXcQ?title=x&artist=y", None),
    ("GET", "/api/equalizer/presets", None),
    ("GET", "/api/equalizer/presets/flat", None),
    ("GET", "/api/library/featured", None),
    ("GET", "/api/library/albums", None),
    ("GET", "/api/library/artists", None),
    ("GET", "/api/artists/some-artist?name=Something", None),
    ("POST", "/api/downloads", {"trackId": "dQw4w9WgXcQ"}),
    ("POST", "/api/tracks/dQw4w9WgXcQ/warm", None),
    ("GET", "/api/share/dQw4w9WgXcQ/link", None),
]

STRICT_ANON = [
    # Account-scoped reads/writes
    ("GET", "/api/tracks/liked", None),
    ("GET", "/api/tracks/liked/count", None),
    ("POST", "/api/tracks/dQw4w9WgXcQ/like", None),
    ("DELETE", "/api/tracks/dQw4w9WgXcQ/like", None),
    ("GET", "/api/playlists", None),
    ("POST", "/api/playlists", {"title": "x"}),
    ("GET", "/api/auth/me", None),
    ("GET", "/api/auth/me/preferences", None),
    ("PUT", "/api/auth/me/preferences", {}),
    # Instance administration / diagnostics
    ("GET", "/api/health/diag", None),
    ("POST", "/api/settings/rescan", None),
    ("GET", "/api/settings/backup", None),
    ("POST", "/api/stream/cache/clear", None),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("method,path,body", GUEST_ALLOWED)
async def test_guest_can_use_policy_endpoints(client_anon, method, path, body):
    """Anonymous callers get a real response, never an auth wall."""
    res = await client_anon.request(method, path, json=body)
    assert res.status_code != 401, (
        f"{method} {path} must be guest-accessible, got 401: {res.text[:120]}"
    )
    assert res.status_code != 403, (
        f"{method} {path} must be guest-accessible, got 403: {res.text[:120]}"
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("method,path,body", STRICT_ANON)
async def test_account_endpoints_refuse_anonymous(client_anon, method, path, body):
    """Account-scoped and instance-admin endpoints fail closed for guests."""
    res = await client_anon.request(method, path, json=body)
    assert res.status_code == 401, (
        f"{method} {path} must refuse anonymous callers, got {res.status_code}"
    )


@pytest.mark.asyncio
async def test_invalid_token_is_rejected_not_downgraded():
    """A presented-but-bad token 401s on guest endpoints too.

    Downgrading would turn every expiry into silent data loss: the user
    would see an empty library instead of a re-login prompt.
    """
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        res = await ac.get(
            "/api/tracks/recently-played",
            headers={"Authorization": "Bearer not-a-real-token"},
        )
    assert res.status_code == 401
    assert "Invalid or expired" in res.text


@pytest.mark.asyncio
async def test_invalid_token_on_strict_endpoint_still_401s():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        res = await ac.get(
            "/api/tracks/liked",
            headers={"Authorization": "Bearer not-a-real-token"},
        )
    assert res.status_code == 401
    assert "Invalid or expired" in res.text


@pytest.mark.asyncio
async def test_signed_in_user_still_gets_account_data(client):
    """The optional dependency must not weaken the authed path."""
    res = await client.get("/api/tracks/liked")
    assert res.status_code == 200
