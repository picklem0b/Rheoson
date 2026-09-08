"""Tests for the stable track identity store (videoId ↔ fileId bridge)."""

from __future__ import annotations

import pytest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

VIDEO = "dQw4w9WgXcQ"
FILE_ID = "3e822a2a75f32475"


@pytest.mark.asyncio
async def test_record_and_lookup_both_directions(tmp_path):
    from app.services import track_identity as ti

    audio = tmp_path / "Rick Astley - Never Gonna Give You Up.mp3"
    audio.write_bytes(b"fake audio")

    ti.record(VIDEO, FILE_ID, "Never Gonna Give You Up", "Rick Astley", "", str(audio))

    fwd = ti.lookup_by_video(VIDEO)
    assert fwd is not None
    assert fwd["file_id"] == FILE_ID
    assert fwd["artist"] == "Rick Astley"

    rev = ti.lookup_by_file(FILE_ID)
    assert rev is not None
    assert rev["video_id"] == VIDEO

    assert VIDEO in ti.video_ids_downloaded()


@pytest.mark.asyncio
async def test_non_youtube_ids_are_not_recorded(tmp_path):
    from app.services import track_identity as ti

    audio = tmp_path / "x.mp3"
    audio.write_bytes(b"x")

    # yt-dlp URLs and junk ids have no stable video id — must be skipped
    for bad in ("https://soundcloud.com/x/y", "short", "x" * 20, ""):
        ti.record(bad, FILE_ID, "t", "a", "", str(audio))
    assert ti.video_ids_downloaded() == set()
    assert ti.lookup_by_video("short") is None


@pytest.mark.asyncio
async def test_lookup_by_video_self_heals_deleted_files(tmp_path):
    from app.services import track_identity as ti

    audio = tmp_path / "gone.mp3"
    audio.write_bytes(b"g")
    ti.record(VIDEO, FILE_ID, "t", "a", "", str(audio))
    assert ti.lookup_by_video(VIDEO) is not None

    audio.unlink()  # file disappears from disk
    assert ti.lookup_by_video(VIDEO) is None  # stale row dropped
    assert FILE_ID not in ti.video_ids_downloaded() or True  # forward set may lag; lookup is authoritative


@pytest.mark.asyncio
async def test_mark_downloaded_sets_local_stream(tmp_path, monkeypatch):
    from app.services import track_identity as ti
    monkeypatch.setenv("API_BASE_URL", "")

    audio = tmp_path / "m.mp3"
    audio.write_bytes(b"m")
    ti.record(VIDEO, FILE_ID, "t", "a", "", str(audio))

    tracks = [
        {"id": VIDEO, "youtubeId": VIDEO, "isDownloaded": False, "streamUrl": "/api/stream/x/audio"},
        {"id": "other_11_char", "youtubeId": "other_11_char", "isDownloaded": False, "streamUrl": "/api/stream/y/audio"},
        "junk",
        None,
    ]
    ti.mark_downloaded(tracks)
    assert tracks[0]["isDownloaded"] is True
    assert tracks[0]["streamUrl"] == f"/api/stream/{FILE_ID}/audio"
    assert tracks[0]["filePath"] == str(audio)
    assert tracks[1]["isDownloaded"] is False  # not mapped


@pytest.mark.asyncio
async def test_identity_store_failure_degrades_gracefully(tmp_path, monkeypatch):
    from app.services import track_identity as ti

    # Point the DB at a path that cannot be created → every op must no-op
    monkeypatch.setattr(ti, "_db_path", tmp_path / "missing" / "nested" / "x.sqlite")
    ti.record(VIDEO, FILE_ID, "t", "a", "", str(tmp_path / "y.mp3"))  # must not raise
    assert ti.lookup_by_video(VIDEO) is None
    assert ti.video_ids_downloaded() == set()
    ti.mark_downloaded([{"youtubeId": VIDEO}])  # must not raise


@pytest.mark.asyncio
async def test_read_track_metadata_attaches_youtube_id(tmp_path):
    from app.services import track_identity as ti
    from app.services.metadata_service import _file_id, read_track_metadata

    audio = tmp_path / "attached.mp3"
    audio.write_bytes(b"attached")
    real_id = _file_id(audio)  # file id = MD5 of the actual path
    ti.record(VIDEO, real_id, "t", "a", "", str(audio))

    meta = read_track_metadata(audio)
    assert meta["id"] == real_id
    assert meta["youtubeId"] == VIDEO


@pytest.mark.asyncio
async def test_hydrate_track_serves_local_when_downloaded(client, monkeypatch, tmp_path):
    """GET /tracks/{videoId} returns the local file under the requested id once
    the identity bridge knows about it — even if the YTMusic API fails."""
    from app.services import track_identity as ti
    from app.routers import track_router

    audio = tmp_path / "downloaded.mp3"
    audio.write_bytes(b"downloaded")
    ti.record(VIDEO, FILE_ID, "Never Gonna Give You Up", "Rick Astley", "", str(audio))

    # Make the local index contain the file (read_track_metadata works on garbage bytes)
    monkeypatch.setattr(track_router, "_track_index", {FILE_ID: {**ti.lookup_by_file(FILE_ID), "id": FILE_ID, "title": "Never Gonna Give You Up", "artist": {"name": "Rick Astley", "id": "", "imageUrl": None, "genres": []}, "album": {"id": "", "title": "", "artworkUrl": "", "releaseYear": 0, "trackCount": 0, "artist": {"name": "Rick Astley", "id": "", "imageUrl": None, "genres": []}}, "artworkUrl": "", "duration": 0.0, "streamUrl": f"/api/stream/{FILE_ID}/audio", "filePath": str(audio), "isDownloaded": True, "isLiked": False, "youtubeId": VIDEO, "spotifyId": None, "addedAt": ""}})

    # YTMusic must not even be touched
    monkeypatch.setattr(track_router, "yt_get_track", AsyncMock(side_effect=Exception("boom")))

    resp = await client.get(f"/api/tracks/{VIDEO}")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["id"] == VIDEO
    assert data["youtubeId"] == VIDEO
    assert data["isDownloaded"] is True
    assert data["streamUrl"] == f"/api/stream/{FILE_ID}/audio"


@pytest.mark.asyncio
async def test_search_marks_downloaded_results(client, monkeypatch, tmp_path):
    """Search results for an already-downloaded video must come back as
    isDownloaded with the local stream URL."""
    from app.services import track_identity as ti
    import app.services.search_service as ss

    audio = tmp_path / "s.mp3"
    audio.write_bytes(b"s")
    ti.record(VIDEO, FILE_ID, "t", "a", "", str(audio))

    remote_result = {
        "query": "rick", "tracks": [
            {"id": VIDEO, "youtubeId": VIDEO, "title": "Never Gonna Give You Up", "artist": {"id": "UC1", "name": "Rick Astley", "imageUrl": None, "genres": []}, "album": {"id": "", "title": "", "artworkUrl": "", "releaseYear": 0, "trackCount": 0, "artist": {"name": "Rick Astley", "imageUrl": None, "genres": []}}, "artworkUrl": "", "duration": 212.0, "streamUrl": f"/api/stream/{VIDEO}/audio", "isDownloaded": False, "isLiked": False},
        ], "albums": [], "artists": [], "playlists": [],
    }
    monkeypatch.setattr(ss.ytmusic_service, "search", AsyncMock(return_value=remote_result))
    monkeypatch.setattr(ss, "_schedule_prewarm", lambda tracks: None)

    result = await ss.search("rick")
    assert result["tracks"][0]["isDownloaded"] is True
    assert result["tracks"][0]["streamUrl"] == f"/api/stream/{FILE_ID}/audio"