"""Matching Spotify songs to YouTube Music, and refusing the wrong recording.

Importing a playlist is only useful if the files are the right songs. These pin
the three ways it goes wrong — a cover, a live take, a medley — and the one way
it used to go wrong silently: truncation.
"""

from __future__ import annotations

import pytest

from app.services import search_service


def _want(title: str, artist: str, duration: float = 180.0) -> dict:
    return {"title": title, "artist": {"name": artist}, "duration": duration, "spotifyId": "sp"}


def _got(title: str, artist: str, duration: float = 180.0) -> dict:
    return {
        "id": "yt1",
        "youtubeId": "yt1",
        "title": title,
        "duration": duration,
        "artist": {"name": artist},
        "album": {},
        "artworkUrl": "http://yt",
    }


def test_an_exact_recording_scores_high():
    score = search_service._score_candidate(_got("Blinding Lights", "The Weeknd"), _want("Blinding Lights", "The Weeknd"))

    assert score > 0.95


def test_a_release_tag_does_not_break_the_match():
    score = search_service._score_candidate(
        _got("Blinding Lights (Remastered 2011)", "The Weeknd"),
        _want("Blinding Lights", "The Weeknd"),
    )

    assert score > 0.95


def test_a_cover_never_clears_the_floor():
    score = search_service._score_candidate(
        _got("Blinding Lights", "Boyce Avenue"),
        _want("Blinding Lights", "The Weeknd"),
    )

    assert score < search_service._MATCH_FLOOR


def test_a_live_take_is_penalised_by_its_length():
    studio = search_service._score_candidate(_got("Song", "Band", 180), _want("Song", "Band", 180))
    live = search_service._score_candidate(_got("Song", "Band", 420), _want("Song", "Band", 180))

    assert live < studio


def test_a_whole_album_upload_is_rejected():
    score = search_service._score_candidate(_got("Song", "Band", 3_600), _want("Song", "Band", 180))

    assert score < search_service._MATCH_FLOOR


@pytest.mark.asyncio
async def test_matching_keeps_order_and_reports_failures(monkeypatch):
    wanted = [
        _want("First", "Band"),
        _want("Second", "Band"),
        _want("Third", "Band"),
    ]

    async def fake_candidates(query: str, limit: int = 5):
        if query.startswith("Second"):
            return [_got("Second", "Somebody Else")]
        if query.startswith("Third"):
            raise RuntimeError("rate limited")
        return [_got("First", "Band")]

    monkeypatch.setattr(search_service.ytmusic_service, "search_candidates", fake_candidates)

    matched, unmatched = await search_service._match_tracks_concurrent(wanted)

    assert [t["title"] for t in matched] == ["First"]
    assert matched[0]["spotifyId"] == "sp"
    assert matched[0]["matchScore"] > search_service._MATCH_FLOOR
    assert [(u["title"], "no close match" in u["reason"]) for u in unmatched] == [
        ("Second", True),
        ("Third", False),
    ]
    assert "search failed" in unmatched[1]["reason"]


@pytest.mark.asyncio
async def test_a_playlist_is_not_truncated(monkeypatch):
    """The old code imported 50 of a 120-track playlist and said nothing."""
    tracks = [
        {
            "id": f"sp{i}",
            "title": f"Song {i}",
            "artist": {"name": "Band"},
            "duration": 180.0,
            "spotifyId": f"sp{i}",
            "artworkUrl": "",
            "album": {},
        }
        for i in range(120)
    ]

    async def fake_playlist(_sid: str):
        return {
            "id": "pid",
            "title": "Big",
            "artworkUrl": "",
            "trackCount": 120,
            "tracks": tracks,
            "skipped": {"local": 2, "episode": 0, "missing": 0},
        }

    async def fake_candidates(query: str, limit: int = 5):
        title, artist = query.rsplit(" ", 1)
        return [_got(title, artist)]

    monkeypatch.setattr(search_service.spotify_service, "get_playlist", fake_playlist)
    monkeypatch.setattr(search_service.ytmusic_service, "search_candidates", fake_candidates)

    result = await search_service._resolve_spotify("https://open.spotify.com/playlist/pid")

    assert result["type"] == "playlist"
    assert result["matched"] == 120
    assert len(result["tracks"]) == 120
    assert result["total"] == 122
    assert result["skipped"] == 2
    assert result["unmatched"] == []
    assert result["playlists"][0]["trackCount"] == 122


@pytest.mark.asyncio
async def test_a_single_track_link_reports_when_it_cannot_match(monkeypatch):
    async def fake_track(_sid: str):
        return {
            "id": "sp1",
            "title": "Obscure",
            "artist": {"name": "Nobody"},
            "duration": 200.0,
            "spotifyId": "sp1",
            "artworkUrl": "",
            "album": {},
        }

    async def no_candidates(query: str, limit: int = 5):
        return []

    monkeypatch.setattr(search_service.spotify_service, "get_track", fake_track)
    monkeypatch.setattr(search_service.ytmusic_service, "search_candidates", no_candidates)

    result = await search_service._resolve_spotify("https://open.spotify.com/track/sp1")

    assert result["type"] == "track"
    assert result["tracks"] == []
    assert result["total"] == 1
    assert result["unmatched"][0]["title"] == "Obscure"
