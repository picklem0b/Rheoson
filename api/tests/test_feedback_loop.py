"""Tests for the v2.16.2 discovery loop — dislike/hide feedback, Daily Mixes, Radio."""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock


# ── Dislike / hide ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_dislike_removes_from_liked_and_persists_locally(client):
    tid = "dQw4w9WgXcQ"

    r = await client.post(f"/api/tracks/{tid}/like")
    assert r.status_code == 200

    r = await client.post(f"/api/tracks/{tid}/dislike")
    assert r.status_code == 200
    assert r.json()["disliked"] is True

    from app.services.local_history import read_disliked_local, read_liked_local
    disliked = await read_disliked_local("user_test_123")
    liked = await read_liked_local("user_test_123")
    assert tid in disliked
    assert tid not in liked  # hiding removes from Liked songs

    r = await client.delete(f"/api/tracks/{tid}/dislike")
    assert r.status_code == 200
    assert r.json()["disliked"] is False
    disliked = await read_disliked_local("user_test_123")
    assert tid not in disliked


@pytest.mark.asyncio
async def test_autoplay_excludes_disliked_tracks(client, monkeypatch):
    """Hidden tracks must never appear as autoplay candidates."""
    from app.services import recommendation_engine as eng

    hidden = "hidden11111"
    shown = "shown22222"

    class FakeProfile:
        total_plays = 50
        top_artists = []
        top_genres = []
        liked_track_ids = []

    class FakeDB:
        class _C:
            async def find_one(self, filter, **kw):
                return {"user_id": "u", "track_ids": [hidden]}
        disliked_tracks = _C()

    monkeypatch.setattr(eng, "build_taste_profile", AsyncMock(return_value=FakeProfile()))
    monkeypatch.setattr(eng, "is_cold_start", lambda p: False)
    monkeypatch.setattr(eng, "_load_disliked_ids", AsyncMock(return_value={hidden}))

    async def fake_search(q, limit=None):
        return {"tracks": [
            {"id": hidden, "title": "h", "artist": {"name": "A"}, "album": {"name": "x"}},
            {"id": shown, "title": "s", "artist": {"name": "B"}, "album": {"name": "y"}},
        ], "albums": [], "artists": [], "playlists": []}

    # the engine imports _hydrate_track at call time from track_router
    import app.routers.track_router as tr
    monkeypatch.setattr(tr, "_hydrate_track", AsyncMock(return_value={
        "id": "seed1234567", "title": "seed", "artist": {"name": "SeedArtist"}, "album": {},
    }))
    # engine imports yt_search at call time from ytmusic_service
    import app.services.ytmusic_service as ytm
    monkeypatch.setattr(ytm, "search", fake_search)

    candidates = await eng.get_autoplay_candidates(FakeDB(), "user", "seed1234567", limit=5)
    ids = [c["track_id"] for c in candidates]
    assert shown in ids
    assert hidden not in ids


# ── Daily Mixes ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_mixes_cold_start_returns_empty(client):
    resp = await client.get("/api/recommendations/mixes")
    assert resp.status_code == 200
    data = resp.json()
    assert data["mixes"] == []


@pytest.mark.asyncio
async def test_mixes_builds_one_mix_per_top_genre(client, monkeypatch):
    import app.routers.recommendation_router as rr

    async def fake_taste(user_id):
        return {
            "top_genres": [{"genre": "Rock", "score": 1.0}, {"genre": "Hip-Hop", "score": 0.9}],
            "cold_start": False,
        }

    monkeypatch.setattr(rr, "_local_taste_profile", fake_taste)

    rock = {"id": "rock1111111", "title": "R1", "artist": {"name": "RArtist"}, "album": {"name": "a"}, "artworkUrl": "x", "isDownloaded": False}
    hiphop = {"id": "hiphop22222", "title": "H1", "artist": {"name": "HArtist"}, "album": {"name": "b"}, "artworkUrl": "y", "isDownloaded": False}

    async def fake_search(query, limit=None):
        if "rock" in query.lower():
            return {"tracks": [rock], "albums": [], "artists": [], "playlists": []}
        return {"tracks": [hiphop], "albums": [], "artists": [], "playlists": []}

    import app.services.ytmusic_service as ytm
    monkeypatch.setattr(ytm, "search", fake_search)

    resp = await client.get("/api/recommendations/mixes")
    assert resp.status_code == 200
    mixes = resp.json()["mixes"]
    assert len(mixes) == 2
    assert mixes[0]["title"] == "Daily Mix 1"
    assert mixes[0]["subtitle"] == "Rock"
    assert mixes[0]["tracks"][0]["id"] == "rock1111111"
    assert mixes[1]["subtitle"] == "Hip-Hop"


# ── Radio ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_radio_seed_excluded_and_disliked_filtered(client, monkeypatch):
    import app.routers.recommendation_router as rr
    import app.routers.track_router as tr
    import app.services.ytmusic_service as ytm

    seed_id = "seed1234567"
    hidden = "hidden11111"

    monkeypatch.setattr(tr, "_hydrate_track", AsyncMock(return_value={
        "id": seed_id, "title": "Seed", "artist": {"id": "UC123", "name": "SeedArtist"}, "album": {},
    }))
    # local mode: db_available() False → _load_disliked_ids via local mirror
    from app.services.local_history import dislike_local
    await dislike_local("user_test_123", hidden)

    async def fake_search(query, limit=None):
        return {"tracks": [
            {"id": "t1aaaa1111", "title": "T1", "artist": {"name": "SeedArtist"}, "album": {"name": "a"}},
            {"id": "t2bbbb2222", "title": "T2", "artist": {"name": "Other"}, "album": {"name": "b"}},
            {"id": hidden, "title": "Hidden", "artist": {"name": "Bad"}, "album": {"name": "c"}},
            {"id": seed_id, "title": "Seed", "artist": {"name": "SeedArtist"}, "album": {"name": "s"}},
        ], "albums": [], "artists": [], "playlists": []}

    async def fake_trending():
        return []

    monkeypatch.setattr(ytm, "search", fake_search)
    monkeypatch.setattr(ytm, "get_trending", fake_trending)
    monkeypatch.setattr(ytm, "get_artist_with_content", AsyncMock(return_value={"related": []}))

    resp = await client.get("/api/recommendations/radio", params={"track_id": seed_id})
    assert resp.status_code == 200
    data = resp.json()
    ids = [t["id"] for t in data["tracks"]]
    assert data["seed"]["id"] == seed_id
    assert seed_id not in ids          # seed itself excluded
    assert hidden not in ids           # disliked excluded
    assert "t1aaaa1111" in ids and "t2bbbb2222" in ids