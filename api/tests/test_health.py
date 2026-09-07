"""Tests for the redesigned health & diagnostics endpoints."""

from __future__ import annotations

import pytest

STATUSES = {"passing", "degraded", "failing", "skipped", "not_tested"}


@pytest.mark.asyncio
async def test_root_redirects_to_docs(client):
    """Root should redirect to the API documentation, not a generic body."""
    resp = await client.get("/")
    assert resp.status_code == 200  # client follows redirects
    assert resp.url.path == "/api/docs"
    assert "swagger" in resp.text.lower() or "docs" in resp.text.lower()


@pytest.mark.asyncio
async def test_health_live_is_cheap_and_positive(client):
    resp = await client.get("/health/live")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "passing"
    assert data["liveness"] is True
    assert data["schemaVersion"] == "1.0"


@pytest.mark.asyncio
async def test_health_ready_returns_schema(client):
    resp = await client.get("/health/ready")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in STATUSES
    assert data["schemaVersion"] == "1.0"


@pytest.mark.asyncio
async def test_health_snapshot_structured(client):
    """Health should distinguish subsystem states and never be 'ok'-only."""
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in STATUSES
    assert data["schemaVersion"] == "1.0"
    assert "version" in data
    assert "env" in data
    assert "uptime" in data
    # Per-subsystem checks exist
    for key in ("storage", "mongodb", "binaries", "auth", "config"):
        assert key in data["checks"], f"missing check: {key}"
        assert data["checks"][key]["status"] in STATUSES
    assert data["summary"]  # status counts
    # No secrets / private paths leaked
    body_text = resp.text
    assert "mongodb+srv" not in body_text
    assert "pk_" not in body_text and "sk_" not in body_text and "whsec" not in body_text


@pytest.mark.asyncio
async def test_health_includes_spotify_and_disk_summaries(client):
    resp = await client.get("/api/health")
    data = resp.json()
    assert "spotify" in data
    assert "connected" in data["spotify"]
    storage = data["checks"]["storage"]
    # Audio file count is always reported; free-space totals are present
    # wherever the storage path actually exists.
    assert "audioFiles" in storage
    if "diskFreeBytes" in storage:
        assert "diskTotalBytes" in storage


@pytest.mark.asyncio
async def test_health_diag_requires_auth(client_anon, client):
    # Anonymous must be rejected…
    resp = await client_anon.get("/api/health/diag")
    assert resp.status_code == 401

    # …authenticated requests get fresh subsystem diagnostics
    resp = await client.get("/api/health/diag")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in STATUSES
    assert data["diagnostics"]["forceRefreshedAt"]
    binaries = data["checks"]["binaries"].get("binaries", {})
    assert "ytdlp" in binaries and "ffmpeg" in binaries


@pytest.mark.asyncio
async def test_version_endpoint(client):
    resp = await client.get("/api/version")
    assert resp.status_code == 200
    data = resp.json()
    assert data["version"]
    assert data["name"] == "Rheoson"


@pytest.mark.asyncio
async def test_mongodb_failure_degrades_but_does_not_kill_health(client, monkeypatch):
    """A database that is down must be reported as degraded, not crash or
    hang the health endpoint."""
    import app.core.health as h

    async def fake_check() -> dict:
        return h._check_entry("degraded", "not connected")

    monkeypatch.setattr(h, "_check_mongodb", fake_check)
    monkeypatch.setattr(h, "_PROBE_TTL", -1.0)  # force refresh on next read
    monkeypatch.setattr(h, "_probe_cache", {"ts": 0.0, "checks": {}})

    resp = await client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["checks"]["mongodb"]["status"] == "degraded"
    assert data["status"] in ("degraded", "failing")
