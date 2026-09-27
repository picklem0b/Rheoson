"""Source resolution: the ladder, the failure markers, and the URL cache.

The ladder is the part of this service that YouTube can break overnight, so
these tests pin *behaviour under failure* rather than a particular format
string: a client that declines must not end the attempt, a transport error
must end it immediately, and a success must be remembered.
"""

from __future__ import annotations

import os
import stat
from pathlib import Path

import pytest

from app.core import toolchain
from app.services import resolve

STUB_SOURCE = '''#!/usr/bin/env python3
"""Stand-in for yt-dlp: records its argv, prints a per-mode result."""
import os
import sys

log_path = os.environ.get("STUB_LOG")
with open(log_path, "a", encoding="utf-8") as handle:
    handle.write(" ".join(sys.argv) + "\\n")

mode = os.environ.get("STUB_MODE", "success")
count_path = os.environ.get("STUB_COUNT")
count = 0
if count_path:
    try:
        count = int(open(count_path).read().strip() or "0")
    except OSError:
        count = 0
    with open(count_path, "w", encoding="utf-8") as handle:
        handle.write(str(count + 1))

if mode == "success":
    print("https://cdn.example/audio.m4a?mime=audio%2Fmp4")
    sys.exit(0)

if mode == "extractor_failure":
    sys.stderr.write("ERROR: Requested format is not available. Use --list-formats\\n")
    sys.exit(1)

if mode == "transport_failure":
    sys.stderr.write("ERROR: [Errno 28] No space left on device\\n")
    sys.exit(1)

if mode == "second_client_succeeds":
    if count == 0:
        sys.stderr.write("ERROR: Requested format is not available\\n")
        sys.exit(1)
    print("https://cdn.example/second.m4a")
    sys.exit(0)

sys.stderr.write("ERROR: unknown stub mode\\n")
sys.exit(2)
'''


@pytest.fixture()
def stub_ytdlp(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> dict[str, Path]:
    """Install a stub yt-dlp and point the toolchain resolver at it."""
    binary = tmp_path / "yt-dlp"
    binary.write_text(STUB_SOURCE, encoding="utf-8")
    binary.chmod(binary.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)

    log = tmp_path / "calls.log"
    count = tmp_path / "count.txt"
    log.touch()
    count.write_text("0", encoding="utf-8")

    monkeypatch.setenv("YTDLP_BIN", str(binary))
    monkeypatch.setenv("STUB_LOG", str(log))
    monkeypatch.setenv("STUB_COUNT", str(count))
    toolchain.refresh()
    resolve.clear_direct_url_cache()

    yield {"binary": binary, "log": log, "count": count}

    toolchain.refresh()
    resolve.clear_direct_url_cache()


def calls(log: Path) -> list[str]:
    return [line for line in log.read_text(encoding="utf-8").splitlines() if line.strip()]


# ── the happy path ────────────────────────────────────────────


def test_resolves_and_caches_the_url(stub_ytdlp: dict[str, Path]) -> None:
    os.environ["STUB_MODE"] = "success"

    url = resolve.resolve_direct_url_sync("dQw4w9WgXcQ", timeout=10)

    assert url is not None and url.startswith("https://cdn.example/")
    assert len(calls(stub_ytdlp["log"])) == 1

    # The second resolve is served from the cache: resolution costs a
    # subprocess, and a replay must not pay for it again.
    again = resolve.resolve_direct_url_sync("dQw4w9WgXcQ", timeout=10)
    assert again == url
    assert len(calls(stub_ytdlp["log"])) == 1


def test_expired_cache_entry_is_re_resolved(stub_ytdlp: dict[str, Path]) -> None:
    os.environ["STUB_MODE"] = "success"
    resolve.resolve_direct_url_sync("dQw4w9WgXcQ", timeout=10)

    # A CDN URL outlives its signature only inside the TTL window; past it the
    # service must mint a fresh one rather than hand back a dead link.
    stale = resolve.cached_direct_url("dQw4w9WgXcQ", ttl=0)
    assert stale is None
    # ttl=0 expires on read and drops the entry, so the next call resolves.
    assert resolve.resolve_direct_url_sync("dQw4w9WgXcQ", timeout=10) is not None
    assert len(calls(stub_ytdlp["log"])) == 2


def test_forget_direct_url_drops_the_entry(stub_ytdlp: dict[str, Path]) -> None:
    os.environ["STUB_MODE"] = "success"
    resolve.resolve_direct_url_sync("dQw4w9WgXcQ", timeout=10)
    resolve.forget_direct_url("dQw4w9WgXcQ")

    assert resolve.cached_direct_url("dQw4w9WgXcQ", ttl=3600) is None


# ── failure behaviour ─────────────────────────────────────────


def test_extractor_failure_walks_the_whole_ladder(stub_ytdlp: dict[str, Path]) -> None:
    os.environ["STUB_MODE"] = "extractor_failure"

    assert resolve.resolve_direct_url_sync("dQw4w9WgXcQ", timeout=10) is None
    # Every client is asked; a client declining is exactly the signal to move on.
    assert len(calls(stub_ytdlp["log"])) == len(resolve.DEFAULT_CLIENT_LADDER)


def test_transport_failure_aborts_the_ladder(stub_ytdlp: dict[str, Path]) -> None:
    os.environ["STUB_MODE"] = "transport_failure"

    assert resolve.resolve_direct_url_sync("dQw4w9WgXcQ", timeout=10) is None
    # A disk/network failure is not a client problem: burning the rest of the
    # ladder would only make the failure slower to surface.
    assert len(calls(stub_ytdlp["log"])) == 1


def test_ladder_advances_to_the_next_client(stub_ytdlp: dict[str, Path]) -> None:
    os.environ["STUB_MODE"] = "second_client_succeeds"

    url = resolve.resolve_direct_url_sync("dQw4w9WgXcQ", timeout=10)

    assert url == "https://cdn.example/second.m4a"
    recorded = calls(stub_ytdlp["log"])
    assert len(recorded) == 2
    # The first attempt uses the default client (no extractor-args) and the
    # second names one explicitly — the ladder shape is the contract.
    assert "--extractor-args" not in recorded[0]
    assert "youtube:player_client=" in recorded[1]


def test_ladder_is_configurable(stub_ytdlp: dict[str, Path]) -> None:
    os.environ["STUB_MODE"] = "extractor_failure"

    assert resolve.resolve_direct_url_sync("dQw4w9WgXcQ", timeout=10, ladder=["default"]) is None
    assert len(calls(stub_ytdlp["log"])) == 1


def test_client_attempts_shape() -> None:
    attempts = resolve.client_attempts(["default", "android"])
    assert attempts == [[], ["youtube:player_client=android"]]


# ── failure classification ────────────────────────────────────


@pytest.mark.parametrize(
    "text",
    [
        "ERROR: Requested format is not available",
        "Sign in to confirm you're not a bot",
        "ERROR: Unable to extract player",
        "ERROR: No video formats found",
        "ERROR: nsig extraction failed",
    ],
)
def test_extractor_markers(text: str) -> None:
    assert resolve.is_extractor_failure(text) is True


@pytest.mark.parametrize(
    "text",
    [
        "ERROR: [Errno 28] No space left on device",
        "ERROR: [Errno -3] Temporary failure in name resolution",
        "ERROR: Postprocessing: ffmpeg not found",
    ],
)
def test_transport_errors_are_not_extractor_failures(text: str) -> None:
    # Misclassifying these as client problems would spend the whole ladder on a
    # failure no client can fix.
    assert resolve.is_extractor_failure(text) is False


def test_transient_refusals_are_classified() -> None:
    assert resolve.is_transient_media_refusal("unable to download video data: HTTP Error 403") is True
    assert resolve.is_transient_media_refusal("HTTP Error 429") is True
    assert resolve.is_transient_media_refusal("Requested format is not available") is False


# ── track id safety ───────────────────────────────────────────


def test_valid_track_ids() -> None:
    for track_id in ("dQw4w9WgXcQ", "abc123", "a-b_c", "A" * 64):
        assert resolve.is_valid_track_id(track_id) is True, track_id


def test_dangerous_track_ids_are_refused() -> None:
    # The id becomes a subprocess argument; nothing outside the id alphabet
    # may reach that point — not a separator, not a shell metacharacter.
    for track_id in (
        "",
        "a b",
        "../etc/passwd",
        "abc;rm -rf /",
        "abc$(whoami)",
        "abc|cat",
        "https://www.youtube.com/watch?v=abc",
        "A" * 65,
        "abc\n123",
    ):
        assert resolve.is_valid_track_id(track_id) is False, track_id


# ── mime + range helpers ──────────────────────────────────────


def test_mime_prefers_the_url_declaration() -> None:
    assert resolve.mime_from_response("https://x/y?mime=audio%2Fmp4", "video/webm") == "audio/mp4"
    assert resolve.mime_from_response("https://x/y?mime=audio%2Fwebm", "") == "audio/webm"


def test_mime_falls_back_to_the_header() -> None:
    assert resolve.mime_from_response("https://x/y", "audio/ogg") == "audio/ogg; codecs=opus"
    assert resolve.mime_from_response("https://x/y", "video/mp4") == "audio/mp4"
    assert resolve.mime_from_response("https://x/y", "") == "audio/mpeg"


def test_parse_content_range() -> None:
    assert resolve.parse_content_range("bytes 0-1023/4096") == (0, 1023, 4096)
    assert resolve.parse_content_range("bytes 0-1023/*") == (0, 1023, None)
    assert resolve.parse_content_range(None) == (None, None, None)
    assert resolve.parse_content_range("garbage") == (None, None, None)
