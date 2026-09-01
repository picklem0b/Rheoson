"""Tests for health and root endpoints."""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_root_returns_json(client):
    """Root endpoint should return JSON with app info."""
    resp = await client.get("/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Rheoson API"
    assert "version" in data
    assert "docs" in data
    assert "health" in data


@pytest.mark.asyncio
async def test_health_returns_ok(client):
    """Health endpoint should return status ok."""
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "version" in data
    assert "env" in data
    assert "uptime" in data


@pytest.mark.asyncio
async def test_health_includes_spotify_status(client):
    """Health endpoint should include Spotify connection status."""
    resp = await client.get("/api/health")
    data = resp.json()
    assert "spotify" in data
    assert "connected" in data["spotify"]


@pytest.mark.asyncio
async def test_health_includes_disk_info(client):
    """Health endpoint should include disk usage info."""
    resp = await client.get("/api/health")
    data = resp.json()
    assert "disk" in data


@pytest.mark.asyncio
async def test_version_endpoint(client):
    """Version endpoint should return version info."""
    resp = await client.get("/api/version")
    assert resp.status_code == 200
    data = resp.json()
    assert "version" in data
    assert "name" in data
    assert data["name"] == "Rheoson"
