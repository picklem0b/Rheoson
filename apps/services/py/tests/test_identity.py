"""The identity map — the promise that a download keeps its id.

Every stored like, playlist entry and history row is keyed by videoId. If the
map forgets, those keys stop resolving; if the map lies, ``isDownloaded``
becomes a guess. These tests pin the four behaviours that keep it honest:
one-way recording, both-direction lookup, the unique-file constraint, and
``mark_downloaded`` reading the map rather than matching titles.
"""

from __future__ import annotations

import pytest

from app.services import identity


@pytest.fixture(autouse=True)
def clean_map(tmp_path, monkeypatch: pytest.MonkeyPatch):
    """Each test gets its own sidecar and an empty in-memory mirror."""
    monkeypatch.setenv("ENGINE_DATA_DIR", str(tmp_path))
    identity.reset_caches()
    yield
    identity.reset_caches()


def test_record_then_look_up_both_directions() -> None:
    identity.record("vid001", "file001", title="Song", artist="Artist", album="Album", file_path="/m/a.m4a")

    assert identity.lookup_by_video("vid001")["file_id"] == "file001"
    assert identity.lookup_by_file("file001")["video_id"] == "vid001"
    assert identity.lookup_by_video("nope") is None
    assert identity.lookup_by_file("nope") is None


def test_recording_survives_a_cache_reset() -> None:
    identity.record("vid002", "file002", title="Kept")

    # A reset clears the mirrors; the SQLite sidecar is what remembers.
    identity.reset_caches()

    assert identity.lookup_by_video("vid002")["title"] == "Kept"


def test_a_file_maps_to_only_one_video(tmp_path) -> None:
    identity.record("vidA", "shared", title="A")
    identity.record("vidB", "shared", title="B")

    # file_id is UNIQUE: the later record wins, and the stale row is gone
    # rather than leaving two video ids claiming one file.
    assert identity.lookup_by_file("shared")["video_id"] == "vidB"
    assert identity.lookup_by_video("vidA") is None
    assert identity.lookup_by_video("vidB")["title"] == "B"


def test_re_recording_the_same_video_updates_it() -> None:
    identity.record("vid003", "f1", title="Old")
    identity.record("vid003", "f2", title="New")

    assert identity.lookup_by_video("vid003")["file_id"] == "f2"
    assert identity.lookup_by_file("f1") is None
    assert identity.lookup_by_file("f2")["title"] == "New"


def test_remove_forgets_both_directions() -> None:
    identity.record("vid004", "f4")
    identity.remove("vid004")

    assert identity.lookup_by_video("vid004") is None
    assert identity.lookup_by_file("f4") is None


def test_mark_downloaded_flags_only_mapped_tracks() -> None:
    identity.record("known", "fknown")
    tracks = [{"id": "known"}, {"id": "unknown"}, {"id": "fileknown"}]

    identity.mark_downloaded(tracks)

    assert tracks[0]["isDownloaded"] is True
    assert tracks[0]["videoId"] == "known"
    assert tracks[1]["isDownloaded"] is False
    # A file id is not a video id: it must not be reported as downloaded by
    # accident, or a local file would look like a remote track.
    assert tracks[2]["isDownloaded"] is False


def test_blank_inputs_are_ignored_not_raised() -> None:
    identity.record("", "ignored")
    identity.record("ignored", "")

    assert identity.lookup_by_video("ignored") is None
    assert identity.video_ids_downloaded() == set()


def test_stats_reports_a_count_without_paths() -> None:
    identity.record("vid005", "f5")

    stats = identity.stats()

    assert stats["mappedTracks"] == 1
    assert stats["db"].endswith(".track_map.sqlite")
