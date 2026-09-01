"""Tests for track endpoints."""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_list_tracks_returns_list(client):
    """GET /tracks should return a list."""
    resp = await client.get("/api/tracks")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_liked_count_returns_zero(client):
    """GET /tracks/liked/count should return count of 0 for fresh db."""
    resp = await client.get("/api/tracks/liked/count")
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 0


@pytest.mark.asyncio
async def test_liked_returns_empty(client):
    """GET /tracks/liked should return empty list for fresh db."""
    resp = await client.get("/api/tracks/liked")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_recently_played_returns_empty(client):
    """GET /tracks/recently-played should return empty list."""
    resp = await client.get("/api/tracks/recently-played")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_get_nonexistent_track(client):
    """GET /tracks/{id} for nonexistent track should return 404."""
    resp = await client.get("/api/tracks/nonexistent123")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_like_nonexistent_track(client):
    """POST /tracks/{id}/like should still succeed (tracks can be liked before download)."""
    resp = await client.post("/api/tracks/test-track/like")
    assert resp.status_code == 200
    data = resp.json()
    assert data["liked"] is True


@pytest.mark.asyncio
async def test_clear_history(client):
    """DELETE /tracks/history should succeed."""
    resp = await client.delete("/api/tracks/history")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
