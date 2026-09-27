"""The library scan — what is on disk, and under which identity.

Two things are load-bearing here: hidden directories (``.staging``) must never
be library content, and a mapped file must come back under its **videoId**
rather than its file id, or a downloaded track would change identity the moment
it entered the library.
"""

from __future__ import annotations

import wave

import pytest

from app.services import identity, library, metadata


@pytest.fixture(autouse=True)
def isolated_library(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ENGINE_DATA_DIR", str(tmp_path))
    identity.reset_caches()
    library.invalidate()
    yield
    identity.reset_caches()
    library.invalidate()


def _touch(path, name: str) -> None:
    path.mkdir(parents=True, exist_ok=True)
    (path / name).write_bytes(b"not really audio")


def test_scan_finds_audio_files_and_ignores_everything_else(tmp_path) -> None:
    _touch(tmp_path / "Artist", "One.mp3")
    _touch(tmp_path / "Artist", "Two.flac")
    (tmp_path / "Artist" / "cover.jpg").write_bytes(b"x")
    (tmp_path / "Artist" / "notes.txt").write_text("hi")

    records = library.scan(force=True)

    assert sorted(r["title"] for r in records) == ["One", "Two"]


def test_hidden_directories_are_never_library_content(tmp_path) -> None:
    _touch(tmp_path / "Artist", "Real.mp3")
    # `.staging` holds half-written downloads and `.trash` holds removed ones:
    # neither is a track a user should see listed.
    _touch(tmp_path / ".staging" / "job123", "Half.mp3")
    _touch(tmp_path / ".trash", "Gone.mp3")

    titles = [r["title"] for r in library.scan(force=True)]

    assert titles == ["Real"]


def test_a_mapped_file_reports_its_video_id(tmp_path) -> None:
    _touch(tmp_path / "Artist", "Song.mp3")
    path = tmp_path / "Artist" / "Song.mp3"
    file_id = metadata.file_id(path)
    identity.record("vid123", file_id, title="Song From YouTube", artist="Real Artist")

    record = library.find("vid123")

    assert record is not None
    assert record["id"] == "vid123"
    assert record["videoId"] == "vid123"
    # The identity map's title is preferred when the file is untagged, which is
    # exactly the download case: the tags are written, but a failed write must
    # not lose the real name.
    assert record["title"] == "Song From YouTube"


def test_an_unmapped_file_is_keyed_by_its_file_id(tmp_path) -> None:
    _touch(tmp_path / "Artist", "Local.mp3")

    record = library.scan(force=True)[0]

    assert record["id"] == record["fileId"]
    assert "videoId" not in record


def test_file_id_is_stable_and_path_derived(tmp_path) -> None:
    path = tmp_path / "Artist" / "Song.mp3"
    _touch(tmp_path / "Artist", "Song.mp3")

    assert metadata.file_id(path) == metadata.file_id(path)
    assert len(metadata.file_id(path)) == 16
    # A different file is a different id — this is what every stored URL keys on.
    other = tmp_path / "Artist" / "Other.mp3"
    _touch(tmp_path / "Artist", "Other.mp3")
    assert metadata.file_id(other) != metadata.file_id(path)


def test_artists_and_albums_are_derived_with_counts(tmp_path) -> None:
    _touch(tmp_path / "A", "One.mp3")
    _touch(tmp_path / "A", "Two.mp3")
    _touch(tmp_path / "B", "Three.mp3")
    library.invalidate()

    artists = library.artists()
    albums = library.albums()

    # Untagged files land under the filename-derived defaults, one per folder,
    # which is what makes them addressable instead of invisible.
    assert sum(a["trackCount"] for a in artists) == 3
    assert sum(a["trackCount"] for a in albums) == 3


def test_scan_is_cached_until_invalidated(tmp_path) -> None:
    _touch(tmp_path / "Artist", "One.mp3")
    assert len(library.scan(force=True)) == 1

    _touch(tmp_path / "Artist", "Two.mp3")
    # Still cached: a page of requests must not re-walk the disk.
    assert len(library.scan()) == 1

    library.invalidate()
    assert len(library.scan()) == 2


def test_find_returns_none_for_a_missing_track(tmp_path) -> None:
    assert library.find("nosuchtrack") is None
    assert library.path_for("nosuchtrack") is None


def test_path_for_refuses_a_mapped_track_whose_file_is_gone(tmp_path) -> None:
    identity.record("vidGone", "filedGone", file_path=str(tmp_path / "gone.mp3"))

    # The map is right and the file is missing: the answer is "no bytes", never
    # a path that will fail later at the read.
    assert library.path_for("vidGone") is None


def test_stats_reports_counts_and_root(tmp_path) -> None:
    _touch(tmp_path / "Artist", "One.mp3")

    stats = library.stats()

    assert stats["tracks"] == 1
    assert stats["dataDir"] == str(tmp_path)


def test_read_metadata_falls_back_to_the_filename_for_junk(tmp_path) -> None:
    junk = tmp_path / "Unknown Artist - Nothing.flac"
    junk.write_bytes(b"not audio at all")

    record = metadata.read_track_metadata(junk)

    # An unreadable file must still be addressable: the title comes from the
    # name and the artist default is honest rather than empty.
    assert record["title"] == "Unknown Artist - Nothing"
    assert record["artist"]["name"] == "Unknown Artist"
    assert record["isDownloaded"] is True


def test_write_tags_round_trips_on_a_real_wav(tmp_path) -> None:
    """A generated WAV is a real audio container mutagen can tag, so this
    exercises the actual writer instead of asserting it does not crash."""
    path = tmp_path / "tagged.wav"
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(8000)
        handle.writeframes(b"\x00\x00" * 800)

    wrote = metadata.write_tags(path, title="Tagged Title", artist="Tagged Artist", album="Tagged Album", year=2024)

    assert wrote is True
    record = metadata.read_track_metadata(path)
    assert record["title"] == "Tagged Title"
    assert record["artist"]["name"] == "Tagged Artist"
    assert record["year"] == 2024


def test_write_tags_does_not_raise_on_a_broken_file(tmp_path) -> None:
    broken = tmp_path / "broken.m4a"
    broken.write_bytes(b"\x00\x01\x02")

    # Tagging is the last step of a download: a file that plays untagged beats
    # a job reported as failed, so this returns False instead of raising.
    assert metadata.write_tags(broken, title="x", artist="y") is False


def test_artwork_from_disk_finds_the_sibling_image(tmp_path) -> None:
    audio = tmp_path / "song.m4a"
    audio.write_bytes(b"audio")
    (tmp_path / "song.jpg").write_bytes(b"\xff\xd8\xffjpegdata")

    found = metadata.artwork_from_disk(audio)

    assert found is not None
    data, mime = found
    assert mime == "image/jpeg"
    assert data.startswith(b"\xff\xd8")


def test_image_mime_sniffs_magic_bytes() -> None:
    assert metadata.image_mime(b"\x89PNG\r\n\x1a\nrest") == "image/png"
    assert metadata.image_mime(b"RIFF0000WEBP") == "image/webp"
    assert metadata.image_mime(b"\xff\xd8\xff") == "image/jpeg"
    assert metadata.image_mime(b"unknown") == "image/jpeg"
