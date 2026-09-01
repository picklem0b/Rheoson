"""Tests for download endpoint — validation and error handling."""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_download_requires_track_id_or_url(client):
    """Download without trackId or url should return 400."""
    resp = await client.post("/api/downloads", json={
        "format": "mp3",
        "quality": "320",
    })
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_download_invalid_url_format(client):
    """Download with non-HTTP URL should return 400."""
    resp = await client.post("/api/downloads", json={
        "url": "ftp://example.com/file.mp3",
        "format": "mp3",
        "quality": "320",
    })
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_download_oversized_url_rejected(client):
    """Download with extremely long URL should return 400."""
    resp = await client.post("/api/downloads", json={
        "url": "https://example.com/" + "a" * 3000,
        "format": "mp3",
        "quality": "320",
    })
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_download_long_track_id_rejected(client):
    """Download with extremely long track ID should return 400."""
    resp = await client.post("/api/downloads", json={
        "trackId": "a" * 100,
        "format": "mp3",
        "quality": "320",
    })
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_list_downloads_returns_list(client):
    """GET /downloads should return a list."""
    resp = await client.get("/api/downloads")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_get_nonexistent_download(client):
    """GET /downloads/{id} for nonexistent ID should return 404."""
    resp = await client.get("/api/downloads/nonexistent-id")
    assert resp.status_code == 400  # invalid job ID format


@pytest.mark.asyncio
async def test_cancel_nonexistent_download(client):
    """POST /downloads/{id}/cancel for nonexistent ID should return 404."""
    resp = await client.post("/api/downloads/nonexistent-id/cancel")
    assert resp.status_code == 400  # invalid job ID format


@pytest.mark.asyncio
async def test_delete_nonexistent_download(client):
    """DELETE /downloads/{id} for nonexistent ID should return 404."""
    resp = await client.delete("/api/downloads/nonexistent-id")
    assert resp.status_code == 400  # invalid job ID format


@pytest.mark.asyncio
async def test_batch_download_empty_list(client):
    """Batch download with empty track_ids should return 400."""
    resp = await client.post("/api/downloads/batch", json={"track_ids": []})
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_batch_download_too_many(client):
    """Batch download with >20 tracks should return 400."""
    resp = await client.post("/api/downloads/batch", json={
        "track_ids": [f"track_{i}" for i in range(25)]
    })
    assert resp.status_code == 400
