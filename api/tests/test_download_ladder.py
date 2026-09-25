"""Player-client fallback for downloads.

Pins the behaviour that turns a permanent failure into a slower success:
YouTube answers each player client with a different format set, so when one
client reports "Requested format is not available" or "Sign in to confirm
you're not a bot" the download must try the next client instead of dying.

The companion rule matters just as much — a *non*-extractor failure (no disk,
no network) must not walk the whole ladder, because that only delays the
error the user needs to see.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from app.services import download_service as ds
from app.services import stream_service


@pytest.fixture
def job(monkeypatch, tmp_path):
    """A queued job whose music/download dirs point inside tmp_path."""
    music = tmp_path / "music"
    downloads = tmp_path / "downloads"
    music.mkdir(parents=True, exist_ok=True)
    downloads.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(ds.settings, "MUSIC_DIR", str(music))
    monkeypatch.setattr(ds.settings, "DOWNLOADS_DIR", str(downloads))
    # The service also reads the raw env for a couple of paths; keep the two
    # in sync so a helper can never reach the real library directory.
    monkeypatch.setenv("MUSIC_DIR", str(music))
    monkeypatch.setenv("DOWNLOADS_DIR", str(downloads))

    # This suite pins yt-dlp's format negotiation, so it holds the
    # post-processor as available: whether the host really ships ffmpeg must
    # not change what these tests measure.
    from app.core import toolchain
    monkeypatch.setattr(toolchain, "has_ffmpeg", lambda: True)

    job = ds._new_job("l-81Sh8Thm4", "Oh Ok", "Artist", "", "mp3", "320")
    ds._jobs[job["id"]] = job
    yield job
    ds._jobs.pop(job["id"], None)
    ds._tasks.pop(job["id"], None)


URL = "https://www.youtube.com/watch?v=l-81Sh8Thm4"


def _write_result(job_id: str, name: str = "Oh Ok.mp3", data: bytes = b"AUDIO") -> None:
    staging = ds._staging_dir(job_id)
    staging.mkdir(parents=True, exist_ok=True)
    (staging / name).write_bytes(data)


@pytest.mark.asyncio
async def test_extractor_failure_moves_to_the_next_client(job, monkeypatch):
    """One client refusing the format must not end the download."""
    seen: list[list[str]] = []

    async def fake_attempt(job_id, job_dict, cmd, concurrency):
        seen.append(cmd)
        if len(seen) == 1:
            return 1, (
                "ERROR: [youtube] l-81Sh8Thm4: Requested format is not available. "
                "Use --list-formats for a list of available formats"
            )
        _write_result(job_id)
        return 0, ""

    monkeypatch.setattr(ds, "_run_ytdlp_attempt", fake_attempt)

    path = await ds._run_download(job["id"], URL, "Artist")

    assert path is not None, "the second client should have produced a file"
    assert path.read_bytes() == b"AUDIO"
    assert len(seen) == 2, "exactly one retry"

    # Default client first (it still exposes audio-only formats), then the
    # challenge-free mobile client.
    assert "--extractor-args" not in seen[0]
    assert "youtube:player_client=android" in seen[1]

    # And every attempt asks for a selector permissive enough to accept what
    # whichever client answered is willing to serve.
    for cmd in seen:
        assert stream_service.FORMAT_SELECTOR in cmd


@pytest.mark.asyncio
async def test_transient_refusal_retries_the_same_client(job, monkeypatch):
    """A refused transfer must be retried, not answered with another client.

    `unable to download video data: HTTP Error 403` means extraction succeeded
    and the CDN refused the bytes — a stale signature. Switching player client
    cannot fix it, and it is also matched by is_extractor_failure(), so this is
    the case that used to burn every rung and end on "refused this track on
    every client we tried".
    """
    seen: list[list[str]] = []

    async def fake_attempt(job_id, job_dict, cmd, concurrency):
        seen.append(cmd)
        if len(seen) == 1:
            return 1, (
                "ERROR: unable to download video data: HTTP Error 403: Forbidden"
            )
        _write_result(job_id)
        return 0, ""

    monkeypatch.setattr(ds, "_run_ytdlp_attempt", fake_attempt)
    monkeypatch.setattr(ds, "_TRANSIENT_RETRY_DELAYS", (0.0, 0.0))

    path = await ds._run_download(job["id"], URL, "Artist")

    assert path is not None and path.read_bytes() == b"AUDIO"
    assert len(seen) == 2, "one retry, and it must not be a client switch"
    assert seen[0] == seen[1], "the retry repeats the same client and command"


@pytest.mark.asyncio
async def test_stale_refusal_still_walks_the_ladder_when_retries_run_out(job, monkeypatch):
    """Retrying is bounded: a client that keeps refusing gives way to the next."""
    clients: list[str] = []

    async def fake_attempt(job_id, job_dict, cmd, concurrency):
        if "--extractor-args" in cmd:
            clients.append(cmd[cmd.index("--extractor-args") + 1])
        else:
            clients.append("default")
        return 1, "ERROR: unable to download video data: HTTP Error 403: Forbidden"

    monkeypatch.setattr(ds, "_run_ytdlp_attempt", fake_attempt)
    monkeypatch.setattr(ds, "_TRANSIENT_RETRY_DELAYS", (0.0, 0.0))

    with pytest.raises(RuntimeError) as err:
        await ds._run_download(job["id"], URL, "Artist")

    assert clients.count("default") == 3, "first failure plus two retries"
    assert len(clients) == len(stream_service.client_attempts()) * 3
    # The user is told the transfer was cut short — not that every client
    # refused the track, which is what this failure used to say.
    assert "cut the transfer short" in str(err.value)
    assert "every client" not in str(err.value)


@pytest.mark.asyncio
async def test_attempts_do_not_share_a_staging_directory(job, monkeypatch):
    """Leftovers from a failed client must not be mistaken for the result.

    Each client can hand back a different container, so the picker that takes
    "the newest audio file" would otherwise grab the previous attempt's
    partial download.
    """
    observed: list[list[str]] = []

    async def fake_attempt(job_id, job_dict, cmd, concurrency):
        staging = ds._staging_dir(job_id)
        observed.append(sorted(p.name for p in staging.glob("*")))
        if len(observed) == 1:
            _write_result(job_id, "from-client-one.mp3", b"STALE")
            return 1, "ERROR: [youtube] x: Requested format is not available."
        _write_result(job_id, "from-client-two.mp3", b"FRESH")
        return 0, ""

    monkeypatch.setattr(ds, "_run_ytdlp_attempt", fake_attempt)

    path = await ds._run_download(job["id"], URL, "Artist")

    assert observed[0] == []
    assert observed[1] == [], "staging must be emptied before the next attempt"
    assert path is not None and path.read_bytes() == b"FRESH"


@pytest.mark.asyncio
async def test_transport_failure_does_not_walk_the_ladder(job, monkeypatch):
    """No disk space is not something another player client can fix."""
    calls = 0

    async def fake_attempt(job_id, job_dict, cmd, concurrency):
        nonlocal calls
        calls += 1
        return 1, "ERROR: unable to write data to disk: No space left on device"

    monkeypatch.setattr(ds, "_run_ytdlp_attempt", fake_attempt)

    with pytest.raises(RuntimeError):
        await ds._run_download(job["id"], URL, "Artist")

    assert calls == 1, "a transport error must surface immediately"


@pytest.mark.asyncio
async def test_exhausted_ladder_reports_safely_and_keeps_partial_data(job, monkeypatch):
    """Failing every client must leave resumable bytes and a safe message."""

    async def fake_attempt(job_id, job_dict, cmd, concurrency):
        staging = ds._staging_dir(job_id)
        staging.mkdir(parents=True, exist_ok=True)
        (staging / "Oh Ok.mp3.part").write_bytes(b"x" * 4096)
        return 1, "ERROR: Sign in to confirm you're not a bot."

    monkeypatch.setattr(ds, "_run_ytdlp_attempt", fake_attempt)

    with pytest.raises(RuntimeError) as err:
        await ds._run_download(job["id"], URL, "Artist")

    message = str(err.value)
    # This string is rendered to the user, so it must be actionable copy — not
    # the raw subprocess tail, which quotes the video id and upstream wording
    # the user can do nothing about. The tail is preserved in the log instead.
    assert "Sign in to confirm" not in message
    assert "l-81Sh8Thm4" not in message
    assert "tried" in message

    assert ds._staged_bytes(job["id"]) > 0, "resumable bytes must survive"
    staging = ds._staging_dir(job["id"])
    assert (staging / "Oh Ok.mp3.part").exists()
    assert os.path.exists(staging)
