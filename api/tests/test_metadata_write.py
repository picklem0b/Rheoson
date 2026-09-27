"""Tagging written by the download pipeline must be readable back.

The regression: ``_tag_and_finish`` imported ``write_tags`` from
``metadata_service``, which only ever had *readers*. Every download therefore
reported ``download.tag.failed — cannot import name 'write_tags'``, completed
anyway, and landed an untagged file with no cover art. Nothing failed loudly
because tagging is best-effort, which is exactly why it went unnoticed.

These tests drive the real containers (encoded by ffmpeg) and read the result
back through the same accessor the library scanner uses, so a green run means
a downloaded file carries its metadata into the app.
"""

from __future__ import annotations

import base64
import shutil
import subprocess

import pytest

from app.services.metadata_service import (
    extract_artwork_bytes,
    read_track_metadata,
    write_tags,
)

# A real 1x1 PNG — `extract_artwork_bytes` needs a genuine image signature so
# the MIME sniffing is exercised rather than mocked.
PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)

CONTAINERS = [".mp3", ".m4a", ".flac", ".ogg", ".opus"]

ffmpeg_available = shutil.which("ffmpeg") is not None

pytestmark = pytest.mark.skipif(
    not ffmpeg_available, reason="ffmpeg is required to encode the test fixtures"
)


def _silence(path, seconds: float = 0.2) -> None:
    """Encode a short, silent file in the container indicated by the suffix."""
    subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
            "-t", str(seconds), str(path),
        ],
        check=True,
    )


@pytest.mark.parametrize("suffix", CONTAINERS)
def test_written_tags_read_back(tmp_path, suffix):
    path = tmp_path / f"track{suffix}"
    _silence(path)

    write_tags(
        path,
        title="Fluffing a Duck",
        artist="Kevin MacLeod",
        album="Royalty Free",
        artwork=PNG_1X1,
        lyrics="words that were sung",
        track_number=4,
        date="2024-05-01",
    )

    meta = read_track_metadata(path)

    assert meta["title"] == "Fluffing a Duck"
    assert meta["artist"]["name"] == "Kevin MacLeod"
    assert meta["album"]["title"] == "Royalty Free"
    assert meta["trackNumber"] == 4
    assert meta["album"]["releaseYear"] == 2024
    # The file is a real, playable stream — duration comes from the container.
    assert meta["duration"] > 0

    artwork = extract_artwork_bytes(path)
    assert artwork == PNG_1X1


def test_empty_artwork_is_skipped_not_stored(tmp_path):
    """A zero-length cover is worse than none: readers show a broken image."""
    path = tmp_path / "track.mp3"
    _silence(path)

    write_tags(path, title="T", artist="A", artwork=b"")

    assert extract_artwork_bytes(path) is None
    assert read_track_metadata(path)["title"] == "T"


def test_rewriting_replaces_rather_than_duplicates(tmp_path):
    """Tagging twice must not accumulate frames or covers."""
    path = tmp_path / "track.mp3"
    _silence(path)

    write_tags(path, title="First", artist="A", artwork=PNG_1X1)
    write_tags(path, title="Second", artist="B", artwork=PNG_1X1)

    meta = read_track_metadata(path)
    assert meta["title"] == "Second"
    assert meta["artist"]["name"] == "B"


def test_unsupported_container_raises(tmp_path):
    path = tmp_path / "notes.txt"
    path.write_text("not audio")

    with pytest.raises(ValueError, match="unsupported container"):
        write_tags(path, title="T", artist="A")


def test_missing_file_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        write_tags(tmp_path / "absent.mp3", title="T", artist="A")


@pytest.mark.parametrize("suffix", [".mp3", ".m4a", ".flac"])
def test_none_title_or_artist_leaves_existing_tags_alone(tmp_path, suffix):
    """`None` means 'leave this field untouched' — the download pipeline's
    way of honouring an 'embed metadata: off' choice without stripping what
    yt-dlp or the source already carried."""
    path = tmp_path / f"track{suffix}"
    _silence(path)
    write_tags(path, title="Keep Me", artist="Original Artist")

    # Artwork still applies — the toggles are independent.
    write_tags(path, title=None, artist=None, artwork=PNG_1X1)

    meta = read_track_metadata(path)
    assert meta["title"] == "Keep Me"
    assert meta["artist"]["name"] == "Original Artist"
    assert extract_artwork_bytes(path) == PNG_1X1
