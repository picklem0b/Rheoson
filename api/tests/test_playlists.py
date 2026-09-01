"""Tests for playlist CRUD endpoints."""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_list_playlists_returns_list(client):
    """GET /playlists should return a list."""
    resp = await client.get("/api/playlists")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_create_playlist(client):
    """POST /playlists should create a new playlist."""
    resp = await client.post("/api/playlists", json={
        "title": "My Test Playlist",
        "description": "A test playlist",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "My Test Playlist"
    assert data["description"] == "A test playlist"
    assert "id" in data
    assert data["trackCount"] == 0


@pytest.mark.asyncio
async def test_create_playlist_requires_title(client):
    """POST /playlists without title should return 422."""
    resp = await client.post("/api/playlists", json={})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_get_nonexistent_playlist(client):
    """GET /playlists/{id} for nonexistent ID should return 404."""
    resp = await client.get("/api/playlists/nonexistent")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_nonexistent_playlist(client):
    """DELETE /playlists/{id} for nonexistent ID should return 204 (no-op)."""
    resp = await client.delete("/api/playlists/nonexistent")
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_update_nonexistent_playlist(client):
    """PATCH /playlists/{id} for nonexistent ID should return 404."""
    resp = await client.patch("/api/playlists/nonexistent", json={"title": "New Title"})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_add_track_to_nonexistent_playlist(client):
    """POST /playlists/{id}/tracks for nonexistent ID should return 404."""
    resp = await client.post("/api/playlists/nonexistent/tracks", json={"trackId": "test"})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_add_track_requires_track_id(client):
    """POST /playlists/{id}/tracks without trackId should return 400."""
    resp = await client.post("/api/playlists/nonexistent/tracks", json={})
    assert resp.status_code == 400
