"""Search — one query, two sources, honest answers.

The remote half is not tested against YouTube here: a test suite that needs the
network fails for reasons that have nothing to do with the code. What *is*
tested is everything the remote path decides before it spawns anything, plus
the local path in full.
"""

from __future__ import annotations

import json

import pytest

from app.core import toolchain
from app.services import identity, library, search


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ENGINE_DATA_DIR", str(tmp_path))
    identity.reset_caches()
    library.invalidate()
    yield
    identity.reset_caches()
    library.invalidate()


def _file(tmp_path, name: str) -> None:
    (tmp_path / "Artist").mkdir(parents=True, exist_ok=True)
    (tmp_path / "Artist" / name).write_bytes(b"audio")


def test_clean_query_strips_control_characters_and_bounds_length() -> None:
    assert search.clean_query("  hello\nworld  ") == "helloworld"
    assert len(search.clean_query("a" * 500)) == search.MAX_QUERY_LEN
    assert search.clean_query("\x00\x1b") == ""


def test_local_search_matches_title_artist_and_album(tmp_path) -> None:
    library.invalidate()
    _file(tmp_path, "Midnight Drive.mp3")

    by_title = search.search_local("midnight")
    by_artist = search.search_local("artist")
    by_album = search.search_local("unknown")

    assert len(by_title) == 1
    assert len(by_artist) == 1
    assert len(by_album) == 1


def test_local_search_is_case_insensitive_and_bounded(tmp_path) -> None:
    library.invalidate()
    for index in range(5):
        _file(tmp_path, f"Track {index}.mp3")

    assert len(search.search_local("TRACK")) == 5
    assert len(search.search_local("track", limit=2)) == 2


def test_an_empty_query_returns_nothing_rather_than_everything(tmp_path) -> None:
    library.invalidate()
    _file(tmp_path, "Anything.mp3")

    # A blank query matching the whole library is how a search box shows the
    # entire disk the moment it is cleared.
    assert search.search_local("") == []
    assert search.search_local("   ") == []


def test_remote_search_is_skipped_without_the_tool(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(toolchain, "ytdlp", lambda: toolchain.Tool("yt-dlp", None, "YTDLP_BIN"))

    assert search.search_remote("anything") == []


def test_combined_search_marks_local_results_downloaded(tmp_path) -> None:
    library.invalidate()
    _file(tmp_path, "Shared Name.mp3")

    result = search.search("shared", include_remote=False)

    assert result["query"] == "shared"
    assert len(result["local"]) == 1
    assert result["local"][0]["source"] == "local"
    assert result["tracks"][0]["isDownloaded"] is True


def test_combined_search_never_duplicates_a_local_result_in_the_remote_list(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    library.invalidate()
    _file(tmp_path, "Shared Name.mp3")
    local_id = library.scan(force=True)[0]["id"]

    def fake_remote(query: str, limit: int = 20) -> list[dict]:
        return [
            {"id": local_id, "title": "Shared Name", "artist": {"id": "A", "name": "A"}, "album": {"id": "X", "title": "X"}, "isDownloaded": False},
            {"id": "remoteonly", "title": "Other", "artist": {"id": "B", "name": "B"}, "album": {"id": "Y", "title": "Y"}, "isDownloaded": False},
        ]

    monkeypatch.setattr(search, "search_remote", fake_remote)

    result = search.search("shared")

    ids = [track["id"] for track in result["tracks"]]
    assert ids.count(local_id) == 1
    assert "remoteonly" in ids


def test_a_remote_result_is_shaped_like_a_track() -> None:
    entry = {
        "id": "vid999",
        "title": "A Song",
        "channel": "A Channel",
        "duration": 213,
        "thumbnails": [{"url": "https://img.example/small.jpg"}, {"url": "https://img.example/large.jpg"}],
    }

    track = search._flat_entry(entry)

    assert track is not None
    assert track["id"] == "vid999"
    assert track["artist"]["name"] == "A Channel"
    assert track["duration"] == 213.0
    # The largest thumbnail is the right default for a card, not the first.
    assert track["artworkUrl"] == "https://img.example/large.jpg"
    assert track["isDownloaded"] is False


def test_an_entry_without_an_id_is_dropped() -> None:
    assert search._flat_entry({"title": "No id"}) is None
    assert search._flat_entry({"id": ""}) is None


def test_remote_search_parses_a_flat_playlist_payload(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setattr(toolchain, "ytdlp", lambda: toolchain.Tool("yt-dlp", "/usr/bin/yt-dlp", "YTDLP_BIN"))

    class FakeProc:
        stdout = json.dumps({"entries": [{"id": "a1", "title": "One"}, {"id": "a2", "title": "Two"}]}).encode()
        stderr = b""

    monkeypatch.setattr(search.subprocess, "run", lambda *a, **k: FakeProc())

    tracks = search.search_remote("anything")

    assert [t["id"] for t in tracks] == ["a1", "a2"]


def test_remote_search_survives_junk_output(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(toolchain, "ytdlp", lambda: toolchain.Tool("yt-dlp", "/usr/bin/yt-dlp", "YTDLP_BIN"))

    class FakeProc:
        stdout = b"not json at all"
        stderr = b""

    monkeypatch.setattr(search.subprocess, "run", lambda *a, **k: FakeProc())

    # A dead search is not an error the caller has to handle: it just has no
    # results, and the UI shows its empty state.
    assert search.search_remote("anything") == []
