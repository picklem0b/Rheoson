"""The streaming fill must report the container it actually wrote.

The regression had two layers, both of which let the server announce a
Content-Type that did not describe the body:

  1. A session was created with a hardcoded ``audio/mp4`` and the response
     headers were built from it before the fill corrected it. On the yt-dlp
     fallback the body was a different container, so the two disagreed.
  2. The fill then decided its own type from ``toolchain.has_ffmpeg()`` —
     "ffmpeg is installed, therefore the output is mp3". That inference is
     false: yt-dlp is piped to stdout, and a post-processor needs a real file
     to run against, so the bytes are YouTube's own stream (m4a, itag 140)
     whether or not ffmpeg exists.

Both are answered the same way: sniff the first chunk. These tests drive the
real ``_fill_buffer_ytdlp`` with a stubbed yt-dlp process and assert the
reported type matches the bytes — and that the command requests audio-only
explicitly, since yt-dlp's default format would otherwise pipe video.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

import app.routers.stream_router as sr

# A minimal but structurally valid ISO base-media (mp4/m4a) header: a box
# length, then `ftyp`. What yt-dlp actually emits to stdout.
M4A_BYTES = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00isommp42" + b"\x00" * 2048

# A minimal MPEG frame sync — what a real mp3 starts with.
MP3_BYTES = b"\xff\xfb\x90\x00" + b"\x00" * 2048


class _FakeStdout:
    """Yields the payload once, then EOF — like a finished subprocess."""

    def __init__(self, payload: bytes) -> None:
        self._payload = payload
        self._sent = False

    async def read(self, _n: int) -> bytes:
        if self._sent:
            return b""
        self._sent = True
        return self._payload


class _FakeProc:
    def __init__(self, payload: bytes) -> None:
        self.stdout = _FakeStdout(payload)
        self.stderr = _FakeStdout(b"")
        self.killed = False

    async def wait(self) -> int:
        return 0

    def kill(self) -> None:
        self.killed = True


def _stub_ytdlp(monkeypatch, payload: bytes) -> list[list[str]]:
    """Stub the yt-dlp spawn and record the commands that ran."""
    commands: list[list[str]] = []

    async def _exec(*cmd, **kwargs):
        commands.append(list(cmd))
        return _FakeProc(payload)

    monkeypatch.setattr(asyncio, "create_subprocess_exec", _exec)
    return commands

@pytest.mark.asyncio
@pytest.mark.parametrize("ffmpeg_present", [True, False])
async def test_reported_mime_matches_the_bytes_regardless_of_ffmpeg(
    tmp_path: Path, monkeypatch, ffmpeg_present: bool
):
    """m4a bytes must be reported as audio/mp4 even when ffmpeg is installed.

    This is the case that broke: ``has_ffmpeg()`` was treated as proof the
    output was mp3, so a response carried ``audio/mpeg`` over an MP4 body.
    """
    monkeypatch.setattr(sr.toolchain, "has_ffmpeg", lambda: ffmpeg_present)
    commands_arg = _stub_ytdlp(monkeypatch, M4A_BYTES)

    reported: list[str] = []
    dest = tmp_path / "buffer.audio"

    mime = await sr._fill_buffer_ytdlp("aaaaaaaaaaa", dest, on_mime=reported.append)

    assert sr._sniff_audio_mime(M4A_BYTES) == "audio/mp4"
    assert mime == "audio/mp4", f"ffmpeg_present={ffmpeg_present} reported {mime}"
    # The type must reach the waiting response too, not just the return value.
    assert reported == ["audio/mp4"]
    assert dest.read_bytes() == M4A_BYTES

    # Audio-only must be explicit. yt-dlp's default format is video+audio, and
    # the ``-x`` shorthand that used to imply this does nothing on a pipe — a
    # regression here would pipe video into an audio buffer.
    commands = commands_arg[0]
    assert "--format" in commands
    fmt = commands[commands.index("--format") + 1]
    assert fmt.startswith("bestaudio"), fmt
    assert "-x" not in commands


@pytest.mark.asyncio
async def test_mp3_bytes_are_reported_as_mpeg(tmp_path: Path, monkeypatch):
    """The sniff is a real read of the body, not a constant."""
    monkeypatch.setattr(sr.toolchain, "has_ffmpeg", lambda: False)
    commands_arg: list[list[str]] = []

    async def _exec(*cmd, **kwargs):
        commands_arg.append(list(cmd))
        return _FakeProc(MP3_BYTES)

    monkeypatch.setattr(asyncio, "create_subprocess_exec", _exec)

    reported: list[str] = []
    dest = tmp_path / "buffer.audio"

    mime = await sr._fill_buffer_ytdlp("aaaaaaaaaaa", dest, on_mime=reported.append)

    assert mime == "audio/mpeg"
    assert reported == ["audio/mpeg"]


@pytest.mark.asyncio
async def test_predicted_mime_does_not_trust_the_audio_format_setting(monkeypatch):
    """The bounded-wait fallback must not resurrect the false inference.

    ``AUDIO_FORMAT`` describes what a *download* produces (a real file, so
    post-processing runs). Streaming pipes to stdout, where it does not apply.
    """
    monkeypatch.setattr(sr.toolchain, "has_ffmpeg", lambda: True)
    monkeypatch.setattr(sr.settings, "AUDIO_FORMAT", "mp3")

    assert sr._predicted_fill_mime() == "audio/mp4"
