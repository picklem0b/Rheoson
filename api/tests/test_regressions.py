"""Regression tests for bugs found during the full-application audit (v2.14.18).

Each test reproduces a bug that shipped and verifies the fix holds:
  1. PATCH /playlists/{id} 500s once the playlist contains tracks
  2. Artist browse 404s (ytmusicapi sections changed shape dict-vs-list)
  3. /tracks/{id} fabricates ghost tracks for nonexistent video IDs
  4. Share card reflects raw query params (reflected XSS)
  5. Share links are not URL-encoded
  6. Settings browse endpoint prefix-traversal check
  7. Stream Range edge cases (suffix ranges, start at EOF) and junk remote IDs
  8. Artwork proxy is an open SSRF relay
  9. Download service referenced non-existent modules for cache invalidation
 10. Rate limiter leaks per-IP buckets
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import re
import textwrap

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.core.exceptions import SearchError


# ── Playlist PATCH after tracks added ──────────────────────────

@pytest.mark.asyncio
async def test_playlist_patch_does_not_500_with_tracks(client, tmp_path, monkeypatch):
    """Regression: PATCHing a playlist that already contains track IDs used to
    return the raw stored string IDs in `tracks`, failing PlaylistSchema
    response validation with a 500."""
    import app.routers.playlist_router as pr

    # Isolate playlist storage to a temp file
    target = tmp_path / ".playlists.json"
    monkeypatch.setattr(pr, "_PLAYLISTS_FILE", target)

    # Fresh playlist
    resp = await client.post("/api/playlists", json={"title": "T", "description": "d"})
    assert resp.status_code == 201
    pid = resp.json()["id"]

    # Add two string track IDs (as the real flow does)
    for tid in ["dQw4w9WgXcQ", "3e822a2a75f32475"]:
        r = await client.post(f"/api/playlists/{pid}/tracks", json={"trackId": tid})
        assert r.status_code == 200

    # PATCH with tracks present — previously 500 Internal server error
    r = await client.patch(
        f"/api/playlists/{pid}",
        json={"title": "Renamed", "artworkUrl": "gradient:2"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["title"] == "Renamed"
    assert data["trackIds"] == ["dQw4w9WgXcQ", "3e822a2a75f32475"]
    assert data["tracks"] == []  # list view never embeds raw string IDs
    assert data["trackCount"] == 2

    # A second PATCH must keep working (storage still holds string IDs)
    r = await client.patch(f"/api/playlists/{pid}", json={"description": "d2"})
    assert r.status_code == 200, r.text

    # List endpoint shape is consistent and valid
    r = await client.get("/api/playlists")
    assert r.status_code == 200
    found = next(p for p in r.json() if p["id"] == pid)
    assert found["trackCount"] == 2


@pytest.mark.asyncio
async def test_playlist_reorder_validates_input(client, tmp_path, monkeypatch):
    import app.routers.playlist_router as pr

    target = tmp_path / ".playlists.json"
    monkeypatch.setattr(pr, "_PLAYLISTS_FILE", target)

    resp = await client.post("/api/playlists", json={"title": "T"})
    pid = resp.json()["id"]
    r = await client.put(
        f"/api/playlists/{pid}/tracks/reorder", json={"trackIds": ["a", "b"]}
    )
    assert r.status_code == 200

    r = await client.put(
        f"/api/playlists/{pid}/tracks/reorder", json={"trackIds": "nope"}
    )
    assert r.status_code == 400

    r = await client.put(
        f"/api/playlists/{pid}/tracks/reorder", json={"trackIds": [1, 2]}
    )
    assert r.status_code == 400


# ── Artist browse (ytmusicapi section shape) ───────────────────

def _artist_payload_with_dict_sections() -> dict:
    """Shape returned by newer ytmusicapi: sections are {'browseId':…,
    'results':[…]}, plus a legacy list form with a stray string sentinel."""
    return {
        "name": "Rick Astley",
        "subscribers": "4.54M",
        "views": "2.1B",
        "thumbnails": [{"url": "https://lh3.googleusercontent.com/x=w400"}],
        "description": "Never gonna give you up",
        "keywords": "pop, 80s",
        "songs": {
            "browseId": "VLOK",
            "results": [
                {
                    "videoId": "dQw4w9WgXcQ",
                    "title": "Never Gonna Give You Up",
                    "artists": [{"name": "Rick Astley", "id": "UC1"}],
                    "album": {"name": "Whenever", "id": "MP1"},
                    "duration": "3:33",
                    "thumbnails": [{"url": "https://i.ytimg.com/vi/x/hqdefault.jpg"}],
                },
                "MORE",  # stray sentinel — must be skipped, not crash
            ],
        },
        "albums": {
            "browseId": "MPA",
            "results": [
                {"title": "Whenever You Need Somebody", "browseId": "MPRE1",
                 "year": "1987", "thumbnails": []}
            ],
        },
        "singles": {
            "browseId": "MPA2",
            "results": [{"title": "Single", "browseId": "MPRE2", "thumbnails": []}],
        },
        "related": {
            "browseId": None,
            "results": [
                {"title": "Taylor Dayne", "browseId": "UC2", "thumbnails": [],
                 "subscribers": "2.7M"}
            ],
        },
    }


@pytest.mark.asyncio
async def test_get_artist_with_content_handles_dict_sections(monkeypatch):
    """Regression: get_artist_with_content 404'd/raised for every real artist
    because newer ytmusicapi returns songs/albums/singles/related as dicts of
    {'browseId','results'} instead of bare lists."""
    from app.services import ytmusic_service as ytm

    fake = MagicMock()
    fake.get_artist.return_value = _artist_payload_with_dict_sections()

    async def fake_init():
        return fake

    monkeypatch.setattr(ytm, "_get_ytm_async", fake_init)
    monkeypatch.setattr(ytm, "_get_ytm", lambda: fake)

    data = await ytm.get_artist_with_content("UC1")
    assert data["name"] == "Rick Astley"
    assert len(data["topTracks"]) == 1
    assert data["topTracks"][0]["id"] == "dQw4w9WgXcQ"
    assert len(data["albums"]) == 1
    assert len(data["singles"]) == 1
    assert len(data["related"]) == 1
    assert data["subscribers"] == "4540000"
    assert data["genres"] == ["pop", "80s"]


@pytest.mark.asyncio
async def test_get_artist_with_content_legacy_lists_still_work(monkeypatch):
    """Older ytmusicapi returned plain lists — parser must keep supporting them."""
    from app.services import ytmusic_service as ytm

    fake = MagicMock()
    payload = _artist_payload_with_dict_sections()
    payload["songs"] = payload["songs"]["results"]
    payload["albums"] = payload["albums"]["results"]
    payload["singles"] = payload["singles"]["results"]
    payload["related"] = payload["related"]["results"]
    fake.get_artist.return_value = payload

    async def fake_init():
        return fake

    monkeypatch.setattr(ytm, "_get_ytm_async", fake_init)
    monkeypatch.setattr(ytm, "_get_ytm", lambda: fake)

    data = await ytm.get_artist_with_content("UC1")
    assert len(data["topTracks"]) == 1
    assert len(data["albums"]) == 1


# ── Ghost track hydration ─────────────────────────────────────

@pytest.mark.asyncio
async def test_get_track_rejects_empty_video_details(monkeypatch):
    """Regression: YouTube answers nonexistent IDs with an empty payload and the
    service fabricated a ghost 'track'; /tracks/{id} now 404s instead."""
    from app.services import ytmusic_service as ytm

    fake = MagicMock()
    fake.get_song.return_value = {"videoDetails": None, "playabilityStatus": {"status": "ERROR"}}

    async def fake_init():
        return fake

    monkeypatch.setattr(ytm, "_get_ytm_async", fake_init)
    monkeypatch.setattr(ytm, "_get_ytm", lambda: fake)

    with pytest.raises(SearchError):
        await ytm.get_track("nonexistent123")


@pytest.mark.asyncio
async def test_get_track_accepts_real_video(monkeypatch):
    from app.services import ytmusic_service as ytm

    fake = MagicMock()
    fake.get_song.return_value = {
        "videoDetails": {
            "videoId": "dQw4w9WgXcQ",
            "title": "Never Gonna Give You Up",
            "author": "Rick Astley",
            "channelId": "UC1",
            "lengthSeconds": "213",
            "thumbnail": {"thumbnails": []},
        }
    }

    async def fake_init():
        return fake

    monkeypatch.setattr(ytm, "_get_ytm_async", fake_init)
    monkeypatch.setattr(ytm, "_get_ytm", lambda: fake)

    data = await ytm.get_track("dQw4w9WgXcQ")
    assert data["title"] == "Never Gonna Give You Up"
    assert data["duration"] == 213.0


# ── Share card XSS + link encoding ────────────────────────────

@pytest.mark.asyncio
async def test_share_card_escapes_query_params(client):
    """Regression: title/artist/artwork were reflected raw into HTML (XSS)."""
    resp = await client.get(
        "/api/share/abc/card",
        params={
            "title": '<script>alert(1)</script>',
            "artist": '<img src=x onerror=alert(2)>',
            "artwork": "javascript:alert(3)",
        },
    )
    assert resp.status_code == 200
    body = resp.text
    assert "<script>alert(1)</script>" not in body
    assert "<img src=x onerror=alert(2)>" not in body
    assert "javascript:alert(3)" not in body
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in body
    # artwork must fall back to the logo, never a javascript: URI
    assert "/assets/logo.png" in body


@pytest.mark.asyncio
async def test_share_link_is_url_encoded(client):
    """Regression: unencoded & and # in title/artist produced invalid URLs."""
    resp = await client.get(
        "/api/share/abc/link",
        params={"title": "Rick & Morty", "artist": "Soul #1"},
    )
    assert resp.status_code == 200
    url = resp.json()["url"]
    assert "&q=" not in url  # raw ampersand would split the query
    assert url == "https://rheoson.onrender.com/search?q=Rick+%26+Morty+Soul+%231"


# ── Settings persistence round-trip ──────────────────────────

def test_saved_directories_env_parses_on_next_boot(tmp_path):
    """Regression: save-directories wrote EXTRA_MUSIC_DIRS as a comma-joined
    string ('/a,/b') which pydantic-settings cannot parse for list[str] — the
    API raised SettingsError and refused to boot on the next restart."""
    from app.routers.settings_router import _persist_dirs_to_env
    from app.core.config import Settings

    env_file = tmp_path / ".env"
    env_file.write_text("MUSIC_DIR=/old\nEXTRA_MUSIC_DIRS=[]\n")
    _persist_dirs_to_env(env_file, "/data/Music", ["/data/Download", "/sdcard/Music"])

    content = env_file.read_text()
    assert "EXTRA_MUSIC_DIRS=[\"/data/Download\", \"/sdcard/Music\"]" in content

    # The critical part: the file must reload cleanly through Settings().
    # Process env vars (set by conftest for isolation) would shadow the file,
    # so drop them for this parse round.
    import os
    saved = {k: os.environ.get(k) for k in ("MUSIC_DIR", "DOWNLOADS_DIR", "EXTRA_MUSIC_DIRS")}
    for k in saved:
        os.environ.pop(k, None)
    try:
        s = Settings(_env_file=str(env_file))
    finally:
        for k, v in saved.items():
            if v is not None:
                os.environ[k] = v
    assert s.MUSIC_DIR == "/data/Music"
    assert s.EXTRA_MUSIC_DIRS == ["/data/Download", "/sdcard/Music"]


# ── Settings browse traversal ─────────────────────────────────

@pytest.mark.asyncio
async def test_browse_directory_blocks_sibling_prefix(client, tmp_path, monkeypatch):
    """Regression: the containment check used startswith(), so a sibling dir
    like /music_evil was treated as being inside /music."""
    import app.routers.settings_router as sr
    from app.core.config import settings

    base = tmp_path / "music"
    sibling = tmp_path / "musicevil"
    base.mkdir()
    sibling.mkdir()
    (base / "a.mp3").write_bytes(b"x")
    (sibling / "secret.mp3").write_bytes(b"y")

    monkeypatch.setattr(settings, "MUSIC_DIR", str(base))
    monkeypatch.setattr(settings, "EXTRA_MUSIC_DIRS", [])

    ok = await client.get("/api/settings/directories/browse", params={"path": str(base)})
    assert ok.status_code == 200

    denied = await client.get(
        "/api/settings/directories/browse", params={"path": str(sibling)}
    )
    assert denied.status_code == 403


# ── Stream range parsing + junk remote ids ────────────────────

def test_parse_range_edge_cases():
    from fastapi import HTTPException
    from app.routers.stream_router import _parse_range

    size = 47_538
    # Open-ended
    assert _parse_range("bytes=0-", size) == (0, size - 1)
    # Closed
    assert _parse_range("bytes=100-199", size) == (100, 199)
    # Suffix range (was 416 before the fix)
    assert _parse_range("bytes=-500", size) == (size - 500, size - 1)
    # Suffix larger than file → whole file
    assert _parse_range("bytes=-999999", size) == (0, size - 1)
    # Start beyond EOF → 416 (was 206 with 0 bytes)
    with pytest.raises(HTTPException) as e:
        _parse_range(f"bytes={size}-", size)
    assert e.value.status_code == 416
    # start > end
    with pytest.raises(HTTPException) as e:
        _parse_range("bytes=500-100", size)
    assert e.value.status_code == 416
    # Garbage
    for bad in ("bytes=abc", "bytes=", "nonsense"):
        with pytest.raises(HTTPException):
            _parse_range(bad, size)


@pytest.mark.asyncio
async def test_stream_rejects_junk_remote_id(client):
    """GET /stream/{id}/audio with a non-local, non-11-char id must 404 fast
    instead of spawning yt-dlp against garbage."""
    resp = await client.get("/api/stream/xx/audio")
    assert resp.status_code == 404


# ── Artwork proxy SSRF ────────────────────────────────────────

@pytest.mark.asyncio
async def test_artwork_proxy_allows_only_artwork_cdns(client, monkeypatch):
    """Regression: /artwork-proxy fetched any URL server-side (SSRF relay)."""
    from app.services import artwork_service as art

    monkeypatch.setattr(art, "fetch_remote_artwork", AsyncMock(return_value=b"img"))

    internal = await client.get(
        "/api/stream/dQw4w9WgXcQ/artwork-proxy",
        params={"url": "http://169.254.169.254/latest/meta-data/"},
    )
    assert internal.status_code == 400

    bad_scheme = await client.get(
        "/api/stream/dQw4w9WgXcQ/artwork-proxy",
        params={"url": "file:///etc/passwd"},
    )
    assert bad_scheme.status_code == 400

    legit = await client.get(
        "/api/stream/dQw4w9WgXcQ/artwork-proxy",
        params={"url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"},
    )
    assert legit.status_code == 200


# ── Download service cache invalidation modules ───────────────

def test_download_service_invalidates_real_modules():
    """Regression: download_service imported app.routers.stream / app.routers.tracks
    (which don't exist), so completed downloads never invalidated the caches —
    new files were invisible until the 30-minute cron rescan."""
    import pathlib
    import app.services.download_service as ds

    text = pathlib.Path(ds.__file__).read_text()
    assert "from app.routers.stream_router import invalidate_stream_cache" in text
    assert "from app.routers.track_router import invalidate_track_index" in text
    assert "from app.routers.stream import" not in text
    assert "from app.routers.tracks import" not in text

    # And the invalidators themselves actually exist and do their job
    from app.routers import stream_router as sr
    from app.routers.track_router import invalidate_track_index

    sr.invalidate_stream_cache()
    assert sr._local_cache == {}
    assert sr._cache_built is False
    invalidate_track_index()  # must not raise


def test_download_job_persists_embed_flags():
    """Regression: embedArtwork/embedLyrics were never stored on the job, so a
    retry silently re-enabled tagging that the user had turned off."""
    from app.services.download_service import _new_job

    job = _new_job(
        "id1", "T", "A", "", "mp3", "320",
        embed_metadata=False, embed_artwork=False, embed_lyrics=False,
    )
    assert job["embedArtwork"] is False
    assert job["embedLyrics"] is False
    assert job["embedMetadata"] is False


# ── Rate limiter bucket pruning ───────────────────────────────

def test_rate_limiter_prunes_stale_buckets():
    from collections import deque
    from app.main import RateLimitMiddleware

    mw = RateLimitMiddleware.__new__(RateLimitMiddleware)
    mw._hits = {
        f"ip{i}:search": deque([0.0]) for i in range(10_001)  # all stale
    }
    mw._max_keys = 10_000
    mw._prune(now=10_000.0, window=60.0)
    assert len(mw._hits) <= 10_000
    # Recent buckets survive
    mw._hits = {"ip:search": deque([9_999.0])}
    mw._prune(now=10_000.0, window=60.0)
    assert "ip:search" in mw._hits


# ── Clerk webhook signature verification ──────────────────────

@pytest.mark.asyncio
async def test_clerk_webhook_signature_validation(client, monkeypatch):
    from app.core.config import settings

    secret = "whsec_" + base64.b64encode(b"super-secret-test-key").decode()
    monkeypatch.setattr(settings, "CLERK_WEBHOOK_SECRET", secret)

    body = json.dumps({
        "type": "user.created",
        "data": {"id": "user_123", "email_addresses": [{"id": "e1", "email_address": "a@b.c"}], "primary_email_address_id": "e1"},
    })
    import time
    ts = str(int(time.time()))
    key = base64.b64decode(secret[6:])
    sig = hmac.new(key, f"msg_1.{ts}.{body}".encode(), hashlib.sha256).hexdigest()

    ok = await client.post(
        "/api/webhooks/clerk",
        content=body,
        headers={
            "svix-id": "msg_1",
            "svix-timestamp": ts,
            "svix-signature": f"v1,{sig}",
        },
    )
    assert ok.status_code == 200, ok.text

    bad = await client.post(
        "/api/webhooks/clerk",
        content=body,
        headers={
            "svix-id": "msg_1",
            "svix-timestamp": ts,
            "svix-signature": "v1,deadbeef",
        },
    )
    assert bad.status_code == 403

    stale = await client.post(
        "/api/webhooks/clerk",
        content=body,
        headers={
            "svix-id": "msg_1",
            "svix-timestamp": "1500000000",
            "svix-signature": f"v1,{sig}",
        },
    )
    assert stale.status_code == 400
