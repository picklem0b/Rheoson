"""Typing the API's own address answers JSON.

The deployment has two Render services: this API and the static SPA. The SPA's
catch-all route answers `/api/*` with `index.html` and HTTP 200, so a typed API
URL can look like a working page while returning the wrong thing entirely. The
two hosts are separated now (the app calls the API origin directly, and the SPA
redirects `/api/*` at it), and these tests pin the API's half: a bare URL is a
JSON service card, not a 307 to the docs.
"""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_the_api_root_is_json(client_anon):
    res = await client_anon.get("/")

    assert res.status_code == 200
    assert res.headers["content-type"].startswith("application/json")
    body = res.json()
    assert body["service"] == "rheoson-api"
    assert body["version"]
    assert body["health"] == "/api/health"
    assert body["frontend"] == "https://rheoson.onrender.com"
    assert "spotify_import" in body["endpoints"]


@pytest.mark.asyncio
async def test_the_api_index_is_json_too(client_anon):
    res = await client_anon.get("/api")

    assert res.status_code == 200
    assert res.json()["service"] == "rheoson-api"


@pytest.mark.asyncio
async def test_the_spotify_import_route_is_advertised(client_anon):
    body = (await client_anon.get("/")).json()

    assert body["endpoints"]["spotify_import"] == "/api/downloads/spotify"
