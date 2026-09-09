"""Tests for the v2.16.4 retention features — Wrapped, streaks, taste onboarding."""

from __future__ import annotations

import pytest
from datetime import datetime, timedelta, timezone


# ── Streak math ───────────────────────────────────────────────

def test_streaks_computation():
    from app.routers.analytics_router import _compute_streaks

    today = datetime.now(timezone.utc).date()
    d = lambda n: str(today - timedelta(days=n))

    # 3 consecutive days ending today → current 3, longest 3
    s = _compute_streaks([d(0), d(1), d(2)])
    assert s["current_streak"] == 3
    assert s["longest_streak"] == 3

    # Gap breaks the longest: 3-day block then a 5-day block
    dates = [d(0), d(1), d(2), d(10), d(11), d(12), d(13), d(14)]
    s = _compute_streaks(dates)
    assert s["current_streak"] == 3
    assert s["longest_streak"] == 5

    # Empty / single
    assert _compute_streaks([]) == {"current_streak": 0, "longest_streak": 0}
    assert _compute_streaks([d(0)])["current_streak"] == 1


# ── Wrapped ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_wrapped_empty_report_shape(client, monkeypatch):
    import app.routers.track_router as tr

    async def fake_hydrate(ids, limit=50):
        return []

    monkeypatch.setattr(tr, "_hydrate_many", fake_hydrate)

    resp = await client.get("/api/analytics/wrapped")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_plays"] == 0
    assert data["top_artists"] == []
    assert data["top_tracks"] == []
    assert len(data["months"]) == 12
    assert data["streaks"]["current_streak"] == 0


@pytest.mark.asyncio
async def test_wrapped_aggregates_plays(client, monkeypatch):
    import app.core.database as dbmod
    import app.routers.track_router as tr

    db = dbmod.get_db()  # the shared conftest mock
    coll = db.user_signals

    rows = [
        {"user_id": "user_test_123", "signal": "play_start", "artist": "Radiohead", "track_id": "t1", "timestamp": datetime(2026, 5, 1, tzinfo=timezone.utc)},
        {"user_id": "user_test_123", "signal": "play_start", "artist": "Radiohead", "track_id": "t1", "timestamp": datetime(2026, 5, 2, tzinfo=timezone.utc)},
        {"user_id": "user_test_123", "signal": "play_start", "artist": "Drake", "track_id": "t2", "timestamp": datetime(2026, 6, 3, tzinfo=timezone.utc)},
    ]
    coll._docs[:] = rows

    async def fake_hydrate(ids, limit=50):
        return [{"id": "t1", "title": "Song 1", "artist": {"name": "Radiohead"}}]

    monkeypatch.setattr(tr, "_hydrate_many", fake_hydrate)
    try:
        resp = await client.get("/api/analytics/wrapped", params={"year": 2026})
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["year"] == 2026
        assert data["total_plays"] == 3
        assert data["total_minutes"] == round(3 * 3.5)
        assert data["top_artists"][0]["artist"] == "Radiohead"
        assert data["top_tracks"][0]["title"] == "Song 1"
        assert data["months"][4]["plays"] == 2   # May (index 4)
        assert data["months"][5]["plays"] == 1   # June
    finally:
        coll._docs[:] = []



# ── Taste onboarding ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_onboard_seeds_taste(client, monkeypatch):
    import app.services.ytmusic_service as ytm

    async def fake_search_one(query):
        return {
            "id": "dQw4w9WgXcQ", "title": "Never Gonna Give You Up",
            "artist": {"name": "Rick Astley"},
            "album": {"name": "x"},
        }

    monkeypatch.setattr(ytm, "search_one", fake_search_one)
    # The Mongo write branch only runs when the db is marked available.
    # Patch the router's module-level reference (it did `from app.core.database
    # import db_available` at import time, so patching the database module's
    # attribute would not rebind it).
    import app.routers.recommendation_router as recmod
    monkeypatch.setattr(recmod, "db_available", lambda: True)

    resp = await client.post("/api/recommendations/onboard", json={"artists": ["Rick Astley"]})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["ok"] is True
    assert data["seeded"] == 1
    assert data["artists"] == ["Rick Astley"]

    # Local liked mirror now contains the seeded track
    from app.services.local_history import read_liked_local
    liked = await read_liked_local("user_test_123")
    assert "dQw4w9WgXcQ" in liked

    # Signals were recorded in the mock db
    import app.core.database as dbmod
    fake = dbmod.get_db()
    signals = [d for d in fake.user_signals._docs if d.get("context", {}).get("source") == "onboarding"]
    assert len(signals) == 5, signals  # LIKE + 4 × PLAY_START (crosses the 10-signal cold-start floor)
    # cleanup
    fake.user_signals._docs[:] = [d for d in fake.user_signals._docs if not d.get("context", {}).get("source") == "onboarding"]


@pytest.mark.asyncio
async def test_onboard_validates_input(client):
    resp = await client.post("/api/recommendations/onboard", json={"artists": []})
    assert resp.status_code == 400

    resp = await client.post("/api/recommendations/onboard", json={})
    assert resp.status_code == 400