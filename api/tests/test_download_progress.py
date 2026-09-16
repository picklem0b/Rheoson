"""Progress-line parsing for the download manager.

yt-dlp's stderr is the only place speed and ETA are available, and it is a
human-readable line rather than structured output — so these parsers are the
one thing standing between a percentage and a real "2 minutes left". The
formats below are the shapes yt-dlp actually emits.
"""

from __future__ import annotations

import pytest

from app.services.download_service import _PROGRESS_RE, _parse_eta, _parse_size

MiB = 1024 ** 2
KiB = 1024


def _fields(line: str):
    m = _PROGRESS_RE.search(line)
    assert m is not None, f"did not match: {line!r}"
    return (
        float(m.group("pct")),
        _parse_size(m.group("size")),
        _parse_size(m.group("speed")),
        _parse_eta(m.group("eta")),
    )


def test_standard_progress_line():
    pct, size, speed, eta = _fields(
        "[download]  45.2% of    3.85MiB at    1.23MiB/s ETA 00:02"
    )
    assert pct == 45.2
    assert size == 4037017
    assert speed == 1289748
    assert eta == 2


def test_fragmented_download_ignores_the_trailing_fragment_counter():
    pct, size, speed, eta = _fields(
        "[download]  67.8% of    8.20MiB at  900.00KiB/s ETA 00:12 (frag 12/34)"
    )
    assert pct == 67.8
    assert speed == 921600
    assert eta == 12


def test_unknown_speed_and_eta_are_absent_not_zero():
    """HLS streams report these as words; zero would render as '0 B/s'."""
    pct, size, speed, eta = _fields(
        "[download]  12.0% of ~  120.4MiB at  Unknown B/s ETA Unknown"
    )
    assert pct == 12.0
    assert size == 126248550
    assert speed is None
    assert eta is None


def test_completed_line():
    pct, size, speed, eta = _fields(
        "[download] 100.0% of   10.00MiB at    5.00MiB/s ETA 00:00"
    )
    assert pct == 100.0
    assert size == 10 * MiB
    assert eta == 0


@pytest.mark.parametrize(
    "line",
    [
        "[download] Destination: Artist - Title.mp3",
        "[ffmpeg] Fixing malformed AAC bitstream",
        "[ExtractAudio] Destination: out.mp3",
        "[youtube] Extracting URL: dQw4w9WgXcQ",
        "ERROR: unable to download video data: HTTP Error 403",
        "",
    ],
)
def test_non_progress_lines_do_not_match(line):
    assert _PROGRESS_RE.search(line) is None


def test_final_summary_line_still_reports_progress():
    """yt-dlp's completion line swaps ETA for a duration; the percentage and
    size are still worth reading, and the ETA is correctly absent."""
    pct, size, _speed, eta = _fields("[download] 100% of 3.85MiB in 00:04")
    assert pct == 100.0
    assert size == 4037017
    assert eta is None


@pytest.mark.parametrize(
    "text,expected",
    [
        ("3.85MiB", 4037017),
        ("900.00KiB", 921600),
        ("1.5GiB", 1610612736),
        ("10MB", 10_000_000),
        ("512B", 512),
        ("Unknown B/s", None),
        ("Unknown", None),
        (None, None),
        ("", None),
        ("not a size", None),
    ],
)
def test_parse_size(text, expected):
    assert _parse_size(text) == expected


@pytest.mark.parametrize(
    "text,expected",
    [
        ("00:02", 2),
        ("01:23", 83),
        ("1:02:03", 3723),
        ("00:00", 0),
        ("Unknown", None),
        ("", None),
        (None, None),
        # Not a real yt-dlp format (it zero-pads), but the parser folds any
        # colon-separated run from the left, so pin the arithmetic.
        ("1:2:3:4", 223384),
        ("ab:cd", None),
    ],
)
def test_parse_eta(text, expected):
    assert _parse_eta(text) == expected


def test_hour_long_eta_is_not_truncated_to_minutes():
    """A large download can report hours; dropping them would understate it."""
    assert _parse_eta("2:30:00") == 2 * 3600 + 30 * 60
