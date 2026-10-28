"""Spotify collections are read whole, and unplayable items are counted.

The bugs these pin are the kind that only show up with a real library: a
playlist cut off at its first API page, an album cut at 50, and local files or
removed tracks silently shrinking the count the user is shown.
"""

from __future__ import annotations

import pytest

from app.core.exceptions import SpotifyError
from app.services import spotify_service

API = "https://api.spotify.com/v1"


def _path(url: str) -> str:
    """Accept either a route path or the absolute `next` URL Spotify returns."""
    return url.split("/v1", 1)[1] if "/v1" in url else url


def _track(i: int, *, kind: str = "track") -> dict:
    return {
        "id": f"t{i}",
        "name": f"Song {i}",
        "duration_ms": 180_000,
        "type": kind,
        "artists": [{"id": "a1", "name": "Band"}],
        "album": {
            "id": "al1",
            "name": "Album",
            "images": [{"url": "http://img", "width": 640}],
            "release_date": "2020-01-01",
        },
    }


@pytest.mark.asyncio
async def test_playlist_follows_every_page(monkeypatch):
    pages = {
        "/playlists/pid": {
            "id": "pid",
            "name": "Big list",
            "images": [{"url": "http://cover", "width": 640}],
            "owner": {"display_name": "me"},
            "tracks": {
                "items": [{"track": _track(i)} for i in range(100)],
                "total": 130,
                "next": f"{API}/playlists/pid/tracks?offset=100",
            },
        },
        "/playlists/pid/tracks?offset=100": {
            "items": [{"track": _track(i)} for i in range(100, 130)],
            "next": None,
        },
    }

    async def fake_request(url: str):
        assert _path(url) in pages, url
        return pages[_path(url)]

    monkeypatch.setattr(spotify_service, "_request", fake_request)

    playlist = await spotify_service.get_playlist("pid")

    assert len(playlist["tracks"]) == 130
    assert playlist["tracks"][-1]["title"] == "Song 129"
    assert playlist["trackCount"] == 130
    assert playlist["title"] == "Big list"
    assert playlist["artworkUrl"] == "http://cover"


@pytest.mark.asyncio
async def test_playlist_counts_what_cannot_play(monkeypatch):
    async def fake_request(url: str):
        return {
            "id": "pid",
            "name": "Mixed",
            "images": [],
            "tracks": {
                "total": 5,
                "next": None,
                "items": [
                    {"track": _track(1)},
                    {"is_local": True, "track": _track(2)},
                    {"track": None},
                    {"track": _track(3, kind="episode")},
                    {"track": _track(4)},
                ],
            },
        }

    monkeypatch.setattr(spotify_service, "_request", fake_request)

    playlist = await spotify_service.get_playlist("pid")

    assert [t["title"] for t in playlist["tracks"]] == ["Song 1", "Song 4"]
    assert playlist["skipped"] == {"local": 1, "missing": 1, "episode": 1}


@pytest.mark.asyncio
async def test_album_pages_its_tracks(monkeypatch):
    pages = {
        "/albums/aid": {
            "id": "aid",
            "name": "Record",
            "images": [],
            "release_date": "1999-06-01",
            "artists": [{"id": "a1", "name": "Band"}],
            "tracks": {
                "items": [_track(i) for i in range(50)],
                "next": f"{API}/albums/aid/tracks?offset=50",
            },
        },
        "/albums/aid/tracks?offset=50": {
            "items": [_track(i) for i in range(50, 57)],
            "next": None,
        },
    }

    async def fake_request(url: str):
        return pages[_path(url)]

    monkeypatch.setattr(spotify_service, "_request", fake_request)

    album = await spotify_service.get_album("aid")

    assert len(album["tracks"]) == 57
    assert album["releaseYear"] == 1999


@pytest.mark.asyncio
async def test_a_private_playlist_says_what_to_do(monkeypatch):
    async def refusing(url: str):
        raise spotify_service._error_for_status(403)

    monkeypatch.setattr(spotify_service, "_request", refusing)

    with pytest.raises(SpotifyError) as err:
        await spotify_service.get_playlist("pid")

    assert "private" in str(err.value)


def test_shared_links_with_a_region_prefix_are_recognised():
    # What the desktop app copies in some regions.
    url = "https://open.spotify.com/intl-de/track/4cOdK2wGLETKBW3PvgPWqT"

    assert spotify_service.detect_spotify_type(url) == "track"
    assert spotify_service.extract_spotify_id(url, "track") == "4cOdK2wGLETKBW3PvgPWqT"


def test_every_link_kind_is_detected():
    assert spotify_service.detect_spotify_type("https://open.spotify.com/album/abc") == "album"
    assert spotify_service.detect_spotify_type("https://open.spotify.com/playlist/abc") == "playlist"
    assert spotify_service.detect_spotify_type("https://open.spotify.com/artist/abc") == "artist"
    assert spotify_service.detect_spotify_type("https://open.spotify.com/episode/abc") is None
