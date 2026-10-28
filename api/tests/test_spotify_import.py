"""The Spotify import endpoints: start it, poll it, and keep it yours.

Matching happens in a background task because a real playlist is minutes of
YouTube Music searches. That makes the state machine part of the API contract,
so it is pinned here rather than discovered in the UI.
"""

from __future__ import annotations

import asyncio

import pytest

from app.services import search_service, spotify_import

SPOTIFY_PLAYLIST = "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"


def _resolved() -> dict:
    return {
        "query": SPOTIFY_PLAYLIST,
        "type": "playlist",
        "tracks": [
            {
                "id": "yt1",
                "youtubeId": "yt1",
                "title": "A",
                "artist": {"name": "B"},
                "duration": 180.0,
                "album": {},
                "artworkUrl": "http://art",
            }
        ],
        "albums": [],
        "artists": [],
        "playlists": [
            {
                "id": "pid",
                "title": "My list",
                "artworkUrl": "http://cover",
                "trackCount": 3,
                "source": "spotify",
            }
        ],
        "total": 3,
        "matched": 1,
        "skipped": 2,
        "unmatched": [
            {"title": "Gone", "artist": "X", "reason": "no close match on YouTube Music"}
        ],
    }


async def _wait_for(client, import_id: str, tries: int = 100) -> dict:
    for _ in range(tries):
        res = await client.get(f"/api/downloads/spotify/{import_id}")
        assert res.status_code == 200, res.text
        body = res.json()
        if body["status"] in {"done", "error"}:
            return body
        await asyncio.sleep(0)
    raise AssertionError("import did not finish")


@pytest.mark.asyncio
async def test_an_import_matches_then_queues(client, monkeypatch):
    queued: list[str] = []

    async def fake_resolve(_url: str) -> dict:
        return _resolved()

    async def fake_enqueue(**kwargs):
        queued.append(kwargs["track_id"])
        return {"id": "job", "trackId": kwargs["track_id"], "status": "queued"}

    monkeypatch.setattr(search_service, "resolve_url", fake_resolve)
    monkeypatch.setattr(spotify_import, "enqueue_download", fake_enqueue)

    started = await client.post("/api/downloads/spotify", json={"url": SPOTIFY_PLAYLIST})
    assert started.status_code == 202, started.text
    assert started.json()["status"] in {"resolving", "queueing", "done"}

    body = await _wait_for(client, started.json()["id"])

    assert body["status"] == "done"
    assert body["kind"] == "playlist"
    assert body["title"] == "My list"
    assert body["artworkUrl"] == "http://cover"
    assert body["total"] == 3
    assert body["matched"] == 1
    assert body["queued"] == 1
    assert body["skipped"] == 2
    assert body["unmatched"][0]["title"] == "Gone"
    assert queued == ["yt1"]


@pytest.mark.asyncio
async def test_a_failed_resolve_is_reported_not_thrown(client, monkeypatch):
    from app.core.exceptions import SpotifyError

    async def refusing(_url: str) -> dict:
        raise SpotifyError("Spotify refused that link — it is private")

    monkeypatch.setattr(search_service, "resolve_url", refusing)

    started = await client.post("/api/downloads/spotify", json={"url": SPOTIFY_PLAYLIST})
    body = await _wait_for(client, started.json()["id"])

    assert body["status"] == "error"
    assert "private" in body["error"]
    assert body["queued"] == 0


@pytest.mark.asyncio
async def test_only_spotify_links_are_accepted(client):
    res = await client.post(
        "/api/downloads/spotify", json={"url": "https://example.com/playlist/1"}
    )

    assert res.status_code == 400
    assert res.json()["code"] == "DVA01"


@pytest.mark.asyncio
async def test_an_import_belongs_to_the_account_that_started_it(
    client, client_as_other_user, monkeypatch
):
    async def fake_resolve(_url: str) -> dict:
        return _resolved()

    async def fake_enqueue(**kwargs):
        return {"id": "job", "trackId": kwargs["track_id"], "status": "queued"}

    monkeypatch.setattr(search_service, "resolve_url", fake_resolve)
    monkeypatch.setattr(spotify_import, "enqueue_download", fake_enqueue)

    started = await client.post("/api/downloads/spotify", json={"url": SPOTIFY_PLAYLIST})
    import_id = started.json()["id"]

    stolen = await client_as_other_user.get(f"/api/downloads/spotify/{import_id}")

    assert stolen.status_code == 404
    assert stolen.json()["code"] == "DNF02"


@pytest.mark.asyncio
async def test_an_unknown_import_is_a_404_with_a_code(client):
    res = await client.get("/api/downloads/spotify/does-not-exist")

    assert res.status_code == 404
    assert res.json()["code"] == "DNF02"
