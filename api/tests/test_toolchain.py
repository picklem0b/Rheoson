"""External-tool resolution and the fallbacks that keep audio working.

Playback and downloads depend on two binaries that are not guaranteed to be
present. These tests pin the resolution order, the degradation when ffmpeg is
absent, and the guarantee that a failure reaching the user is copy they can act
on rather than a subprocess tail.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.core import toolchain
from app.services import download_service as ds
from app.services import stream_service

URL = "https://www.youtube.com/watch?v=l-81Sh8Thm4"


@pytest.fixture(autouse=True)
def _fresh_toolchain():
    toolchain.refresh()
    yield
    toolchain.refresh()


def _fake_binary(directory: Path, name: str, body: str = "#!/bin/sh\nexit 0\n") -> Path:
    path = directory / name
    path.write_text(body)
    path.chmod(0o755)
    return path


def test_explicit_override_wins_over_path(tmp_path, monkeypatch):
    override = _fake_binary(tmp_path, "pinned-ytdlp")
    _fake_binary(tmp_path, "yt-dlp")
    monkeypatch.setenv("YTDLP_BIN", str(override))
    monkeypatch.setenv("PATH", str(tmp_path))
    assert toolchain.ytdlp_bin() == str(override)


def test_invalid_override_falls_back_to_path(tmp_path, monkeypatch):
    monkeypatch.setenv("YTDLP_BIN", str(tmp_path / "does-not-exist"))
    on_path = _fake_binary(tmp_path, "yt-dlp")
    monkeypatch.setenv("PATH", str(tmp_path))
    monkeypatch.setattr(toolchain, "_search_dirs", list)
    assert toolchain.ytdlp().path == str(on_path)


def test_known_directory_is_searched_when_path_is_empty(tmp_path, monkeypatch):
    """A service started with a minimal environment still finds the binary."""
    monkeypatch.delenv("YTDLP_BIN", raising=False)
    monkeypatch.setenv("PATH", str(tmp_path / "empty"))
    installed = _fake_binary(tmp_path, "yt-dlp")
    monkeypatch.setattr(toolchain, "_search_dirs", lambda: [tmp_path])
    assert toolchain.ytdlp().path == str(installed)


def test_missing_downloader_is_reported_as_incapable(tmp_path, monkeypatch):
    monkeypatch.delenv("YTDLP_BIN", raising=False)
    monkeypatch.setenv("PATH", str(tmp_path))
    monkeypatch.setattr(toolchain, "_search_dirs", list)
    caps = toolchain.capabilities()
    assert caps["canDownload"] is False
    assert caps["ytdlp"]["present"] is False


def test_ffmpeg_location_is_passed_only_when_resolved(tmp_path, monkeypatch):
    monkeypatch.delenv("FFMPEG_BIN", raising=False)
    monkeypatch.setenv("PATH", str(tmp_path))
    monkeypatch.setattr(toolchain, "_search_dirs", list)
    assert toolchain.ffmpeg_location_args() == []
    assert toolchain.has_ffmpeg() is False

    installed = _fake_binary(tmp_path, "ffmpeg")
    toolchain.refresh()
    assert toolchain.ffmpeg_location_args() == ["--ffmpeg-location", str(installed)]


def test_install_hint_names_the_host_package_manager(monkeypatch):
    monkeypatch.setattr(toolchain, "is_termux", lambda: True)
    assert toolchain.install_hint("ffmpeg") == "pkg install -y ffmpeg"
    monkeypatch.setattr(toolchain, "is_termux", lambda: False)
    monkeypatch.setattr(toolchain.shutil, "which", lambda name: f"/usr/bin/{name}")
    assert "apt-get install" in toolchain.install_hint("ffmpeg")


def test_raw_audio_mime_sniffing():
    from app.routers.stream_router import _sniff_audio_mime

    assert _sniff_audio_mime(b"\x00\x00\x00\x18ftypmp42") == "audio/mp4"
    assert _sniff_audio_mime(b"\x1aE\xdf\xa3rest") == "audio/webm"
    assert _sniff_audio_mime(b"OggS\x00\x02") == "audio/ogg"
    assert _sniff_audio_mime(b"ID3\x04\x00") == "audio/mpeg"
    assert _sniff_audio_mime(b"") == "audio/mpeg"


@pytest.fixture
def download_job(monkeypatch, tmp_path):
    music = tmp_path / "music"
    downloads = tmp_path / "downloads"
    music.mkdir()
    downloads.mkdir()
    monkeypatch.setattr(ds.settings, "MUSIC_DIR", str(music))
    monkeypatch.setattr(ds.settings, "DOWNLOADS_DIR", str(downloads))
    monkeypatch.setenv("MUSIC_DIR", str(music))
    monkeypatch.setenv("DOWNLOADS_DIR", str(downloads))

    job = ds._new_job("l-81Sh8Thm4", "Oh Ok", "Artist", "", "mp3", "320")
    ds._jobs[job["id"]] = job
    yield job
    ds._jobs.pop(job["id"], None)
    ds._tasks.pop(job["id"], None)


@pytest.mark.asyncio
async def test_download_without_ffmpeg_stays_in_an_audio_container(
    download_job, monkeypatch
):
    """No ffmpeg must degrade the container, not the outcome.

    ``-x``/``--audio-format`` and thumbnail embedding both shell out to ffmpeg.
    Dropping them (and asking only for audio-only formats) keeps the download
    working, in a container the library already indexes.
    """
    monkeypatch.setattr(toolchain, "has_ffmpeg", lambda: False)
    seen: list[list[str]] = []

    async def fake_attempt(job_id, job, cmd, concurrency):
        seen.append(cmd)
        staging = ds._staging_dir(job_id)
        staging.mkdir(parents=True, exist_ok=True)
        (staging / "Oh Ok.m4a").write_bytes(b"AUDIO")
        return 0, ""

    monkeypatch.setattr(ds, "_run_ytdlp_attempt", fake_attempt)

    path = await ds._run_download(download_job["id"], URL, "Artist")

    assert path is not None
    cmd = seen[0]
    assert stream_service.RAW_AUDIO_SELECTOR in cmd
    assert "-x" not in cmd
    assert "--embed-thumbnail" not in cmd


@pytest.mark.asyncio
async def test_download_with_ffmpeg_asks_for_the_full_ladder(download_job, monkeypatch):
    monkeypatch.setattr(toolchain, "has_ffmpeg", lambda: True)
    seen: list[list[str]] = []

    async def fake_attempt(job_id, job, cmd, concurrency):
        seen.append(cmd)
        staging = ds._staging_dir(job_id)
        staging.mkdir(parents=True, exist_ok=True)
        (staging / "Oh Ok.mp3").write_bytes(b"AUDIO")
        return 0, ""

    monkeypatch.setattr(ds, "_run_ytdlp_attempt", fake_attempt)

    await ds._run_download(download_job["id"], URL, "Artist")

    cmd = seen[0]
    assert stream_service.FORMAT_SELECTOR in cmd
    assert "-x" in cmd and "--audio-format" in cmd


@pytest.mark.asyncio
async def test_missing_engine_fails_with_actionable_copy(download_job, monkeypatch):
    """A missing binary is not another player-client problem."""
    monkeypatch.setattr(
        toolchain, "ytdlp", lambda: toolchain.Tool("yt-dlp", None, "YTDLP_BIN")
    )
    calls = 0

    async def fake_attempt(job_id, job, cmd, concurrency):
        nonlocal calls
        calls += 1
        return 1, "unreachable"

    monkeypatch.setattr(ds, "_run_ytdlp_attempt", fake_attempt)

    with pytest.raises(RuntimeError) as err:
        await ds._run_download(download_job["id"], URL, "Artist")

    message = str(err.value)
    assert calls == 0, "the ladder must not run without a binary"
    assert "not installed" in message
    assert "/" not in message, "no server path may reach the user"
