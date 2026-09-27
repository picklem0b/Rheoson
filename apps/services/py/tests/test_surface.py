"""The engine's HTTP surface beyond resolution.

These pin the answers the server depends on: local bytes with real range
semantics (a player's seek must get 206s), an artwork route that can only name
a track and never a host, and download routes that refuse an unowned job rather
than creating one nobody can find.
"""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import main
from app.core import toolchain
from app.services import downloads, identity, library, metadata

client = TestClient(main.app)

TRACK_ID = "dQw4w9WgXcQ"


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ENGINE_DATA_DIR", str(tmp_path))
    identity.reset_caches()
    library.invalidate()
    yield
    identity.reset_caches()
    library.invalidate()


@pytest.fixture()
def local_track(tmp_path) -> Path:
    artist_dir = tmp_path / "Fake Artist"
    artist_dir.mkdir(parents=True, exist_ok=True)
    path = artist_dir / "Fake Song.m4a"
    # 32 deterministic bytes: a range request's answer is checkable by value.
    path.write_bytes(bytes(range(32)))
    identity.record("dQw4w9WgXcQ", metadata.file_id(path), file_path=str(path))
    library.invalidate()
    return path


# ── Library ───────────────────────────────────────────────────


def test_library_tracks_reports_a_total_and_a_page(local_track) -> None:
    body = client.get("/library/tracks").json()

    assert body["total"] == 1
    assert body["tracks"][0]["id"] == TRACK_ID


def test_library_tracks_clamps_pagination(local_track) -> None:
    body = client.get("/library/tracks?limit=100000&offset=-5").json()

    # A list request must not be able to ask for the whole disk.
    assert body["limit"] == 500
    assert body["offset"] == 0


def test_library_rescan_clears_the_cache(local_track, tmp_path) -> None:
    assert client.get("/library/tracks").json()["total"] == 1

    (tmp_path / "Fake Artist" / "Second.m4a").write_bytes(b"more")

    # Still the cached count...
    assert client.get("/library/tracks").json()["total"] == 1
    # ...until a rescan, which is what the server calls after a download.
    assert client.post("/library/rescan").status_code == 200
    assert client.get("/library/tracks").json()["total"] == 2


def test_artists_and_albums_endpoints(local_track) -> None:
    artists = client.get("/library/artists").json()["artists"]
    albums = client.get("/library/albums").json()["albums"]

    assert len(artists) == 1
    assert len(albums) == 1
    # The file has no tags, so the honest defaults are what gets grouped —
    # never an empty artist, which would make the row unaddressable.
    assert artists[0]["name"] == "Unknown Artist"
    assert artists[0]["trackCount"] == 1


# ── Resolution of a local track ───────────────────────────────


def test_resolving_a_local_track_points_at_this_engine(local_track) -> None:
    body = client.get(f"/resolve/{TRACK_ID}").json()

    # Local-first is the whole point: the relay fetches from here, with no
    # extraction and no network at all.
    assert body["local"] is True
    assert body["url"].endswith(f"/local/{TRACK_ID}")
    assert body["expiresAt"] == 0
    assert body["contentType"] == "audio/mp4"


def test_probing_a_local_track_uses_stat(local_track) -> None:
    body = client.get(f"/probe/{TRACK_ID}").json()

    assert body == {"mime": "audio/mp4", "bytes": 32, "local": True}


# ── Local bytes ───────────────────────────────────────────────


def test_local_bytes_are_served_whole(local_track) -> None:
    response = client.get(f"/local/{TRACK_ID}")

    assert response.status_code == 200
    assert response.content == bytes(range(32))
    assert response.headers["accept-ranges"] == "bytes"
    assert response.headers["content-length"] == "32"


def test_local_bytes_answer_a_range_with_206(local_track) -> None:
    response = client.get(f"/local/{TRACK_ID}", headers={"Range": "bytes=4-7"})

    assert response.status_code == 206
    assert response.content == bytes(range(4, 8))
    assert response.headers["content-range"] == "bytes 4-7/32"


def test_local_bytes_answer_an_open_ended_range(local_track) -> None:
    response = client.get(f"/local/{TRACK_ID}", headers={"Range": "bytes=28-"})

    assert response.status_code == 206
    assert response.content == bytes(range(28, 32))
    assert response.headers["content-range"] == "bytes 28-31/32"


def test_local_bytes_answer_a_suffix_range(local_track) -> None:
    response = client.get(f"/local/{TRACK_ID}", headers={"Range": "bytes=-4"})

    assert response.status_code == 206
    assert response.content == bytes(range(28, 32))


def test_a_range_past_the_end_is_416_not_500(local_track) -> None:
    response = client.get(f"/local/{TRACK_ID}", headers={"Range": "bytes=999-1200"})

    assert response.status_code == 416
    assert response.json()["code"] == "SVA01"


def test_head_returns_headers_without_a_body(local_track) -> None:
    response = client.head(f"/local/{TRACK_ID}")

    assert response.status_code == 200
    assert response.content == b""
    assert response.headers["content-length"] == "32"


def test_local_bytes_refuse_an_invalid_id_before_touching_disk() -> None:
    response = client.get("/local/..%2F..%2Fetc%2Fpasswd")

    assert response.status_code in (400, 404)
    if response.status_code == 400:
        assert response.json()["code"] == "SVA03"


def test_local_bytes_report_a_missing_file_as_snf02() -> None:
    response = client.get("/local/notonthisdisk")

    assert response.status_code == 404
    assert response.json()["code"] == "SNF02"


# ── Artwork ───────────────────────────────────────────────────


def test_artwork_prefers_the_sibling_image(local_track, tmp_path) -> None:
    (tmp_path / "Fake Artist" / "Fake Song.jpg").write_bytes(b"\xff\xd8\xffcover")

    response = client.get(f"/artwork/{TRACK_ID}")

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"
    assert response.content == b"\xff\xd8\xffcover"


def test_artwork_reports_none_as_sup04(local_track) -> None:
    response = client.get(f"/artwork/{TRACK_ID}")

    assert response.status_code == 404
    assert response.json()["code"] == "SUP04"


# ── Search ────────────────────────────────────────────────────


def test_an_empty_query_is_refused_with_a_code() -> None:
    response = client.get("/search?q=")

    assert response.status_code == 400
    assert response.json()["code"] == "RVA04"


def test_search_local_only_lists_the_library(local_track, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(toolchain, "ytdlp", lambda: toolchain.Tool("yt-dlp", None, "YTDLP_BIN"))

    body = client.get("/search?q=fake&remote=false").json()

    assert body["remote"] == []
    # A host with no yt-dlp reports the capability as absent rather than
    # pretending the remote half simply had no matches.
    assert body["remoteAvailable"] is False
    assert len(body["tracks"]) == 1


# ── Lyrics ────────────────────────────────────────────────────


def test_lyrics_requires_a_title() -> None:
    response = client.get("/lyrics?title=")

    assert response.status_code == 400
    assert response.json()["code"] == "RVA03"


def test_lyrics_reports_not_found_with_a_code(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import lyrics as lyrics_service

    async def no_lyrics(*_a, **_k):
        return None

    monkeypatch.setattr(lyrics_service, "fetch_lyrics", no_lyrics)

    response = client.get("/lyrics?title=Nothing&artist=Nobody")

    assert response.status_code == 404
    assert response.json()["code"] == "RNF01"


def test_lyrics_are_returned_with_a_parsed_timeline(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import lyrics as lyrics_service

    async def found(*_a, **_k):
        return {
            "plain": "line one\nline two",
            "synced": "[00:01.00] line one\n[00:12.50] line two",
            "title": "T",
            "artist": "A",
            "album": "",
            "duration": 30,
            "source": "lrclib",
        }

    monkeypatch.setattr(lyrics_service, "fetch_lyrics", found)

    body = client.get("/lyrics?title=T&artist=A").json()

    assert body["plain"].startswith("line one")
    assert [line["startTime"] for line in body["lines"]] == [1.0, 12.5]


def test_parse_synced_skips_malformed_lines() -> None:
    from app.services.lyrics import parse_synced

    lines = parse_synced("[00:01.00]ok\nnot a lyric\n[bad]no\n[01:02.50]also ok")

    # A malformed line must be dropped, not shift every later timestamp.
    assert lines == [
        {"startTime": 1.0, "text": "ok"},
        {"startTime": 62.5, "text": "also ok"},
    ]


# ── Downloads ─────────────────────────────────────────────────


@pytest.fixture()
def wired_manager(monkeypatch: pytest.MonkeyPatch, tmp_path):
    fake = tmp_path / "fake-yt-dlp"
    fake.write_text("#!/bin/sh\necho '[download] 100% of 1B'\n", "utf-8")
    fake.chmod(0o755)
    monkeypatch.setattr(toolchain, "ytdlp", lambda: toolchain.Tool("yt-dlp", str(fake), "YTDLP_BIN"))
    monkeypatch.setattr(toolchain, "ffmpeg_location_args", lambda binary="yt-dlp": [])
    manager = downloads.DownloadManager()
    monkeypatch.setattr(main.downloads, "manager", manager)
    yield manager
    manager.shutdown()


def test_creating_a_download_without_an_owner_is_refused(wired_manager) -> None:
    response = client.post("/downloads", json={"trackId": TRACK_ID})

    assert response.status_code == 400
    assert response.json()["code"] == "DVA03"


def test_creating_a_download_takes_the_owner_from_the_header(wired_manager) -> None:
    response = client.post(
        "/downloads",
        json={"trackId": TRACK_ID},
        headers={"X-Owner-Id": "user_a"},
    )

    assert response.status_code == 202
    assert response.json()["owner"] == "user_a"


def test_a_malformed_download_body_is_a_validation_failure(wired_manager) -> None:
    response = client.post(
        "/downloads",
        content=b"not json",
        headers={"X-Owner-Id": "user_a", "Content-Type": "application/json"},
    )

    assert response.status_code == 400
    assert response.json()["code"] == "DVA03"


def test_download_routes_require_the_service_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main, "settings", replace(main.settings, token="secret"))

    assert client.get("/downloads").status_code == 401
    assert client.get("/downloads", headers={"Authorization": "Bearer secret"}).status_code == 200


def test_listing_downloads_is_scoped_by_owner(wired_manager) -> None:
    client.post("/downloads", json={"trackId": TRACK_ID}, headers={"X-Owner-Id": "user_a"})

    mine = client.get("/downloads?owner=user_a").json()
    theirs = client.get("/downloads?owner=user_b").json()

    assert mine["total"] == 1
    assert theirs["total"] == 0


# ── One track by id ───────────────────────────────────────────
# Playlists, history rows and deep links hold an id and nothing else, so this
# route is what makes opening one possible without reading the whole library.


def test_a_single_track_resolves_by_id(local_track) -> None:
    response = client.get(f"/library/tracks/{TRACK_ID}")

    assert response.status_code == 200
    track = response.json()["track"]
    assert track["id"] == TRACK_ID
    assert track["title"] == "Fake Song"


def test_an_unknown_track_is_a_404_and_not_an_empty_object(local_track) -> None:
    response = client.get("/library/tracks/notARealTrack")

    # A playlist listing ids that no longer exist must be able to tell
    # "deleted" apart from "the engine is broken".
    assert response.status_code == 404
    assert response.json()["code"] == "TNF01"


def test_a_traversal_attempt_on_the_track_route_is_rejected(local_track) -> None:
    # Two layers, and both are asserted because only the second one is even a
    # route: an encoded slash is decoded by the ASGI layer before routing, so
    # the path never matches `{track_id}` at all (404). A once-single-segment
    # id that fails the id contract is what reaches the validator (400).
    encoded_slash = client.get("/library/tracks/..%2F..%2Fetc%2Fpasswd")
    bad_characters = client.get("/library/tracks/passwd;rm")

    assert encoded_slash.status_code == 404
    assert bad_characters.status_code == 400
    assert bad_characters.json()["code"] == "SVA03"
