"""Tests for search endpoint — input validation and sanitization."""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_search_requires_query(client):
    """Search without q parameter should return 422."""
    resp = await client.get("/api/search")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_search_empty_query_rejected(client):
    """Empty query should be rejected."""
    resp = await client.get("/api/search?q=")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_search_suggest_requires_query(client):
    """Suggest without q parameter should return 422."""
    resp = await client.get("/api/search/suggest")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_search_suggest_short_query_returns_empty(client):
    """Single character queries should return empty suggestions."""
    resp = await client.get("/api/search/suggest?q=a")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_resolve_requires_body(client):
    """Resolve without body should return 422."""
    resp = await client.post("/api/search/resolve")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_resolve_empty_url_rejected(client):
    """Resolve with empty URL should return 400."""
    resp = await client.post("/api/search/resolve", json={"url": ""})
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_resolve_invalid_url_rejected(client):
    """Resolve with non-URL string should return 400."""
    resp = await client.post("/api/search/resolve", json={"url": "not a url"})
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_resolve_oversized_url_rejected(client):
    """Resolve with extremely long URL should return 400."""
    resp = await client.post("/api/search/resolve", json={"url": "https://example.com/" + "a" * 3000})
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_search_filter_validation(client):
    """Invalid filter value should be rejected."""
    resp = await client.get("/api/search?q=test&filter=invalid")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_search_valid_filter_accepted(client):
    """Valid filter values should be accepted (even if search fails)."""
    # This will fail at the YTMusic level but the filter should be accepted
    resp = await client.get("/api/search?q=test&filter=songs")
    # Should get past validation (502 from YTMusic is fine)
    assert resp.status_code in (200, 502)
