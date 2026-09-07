"""Regression: cancelling a download must actually kill yt-dlp.

Before the cancellable-subprocess rewrite, downloads ran in a threadpool
executor that asyncio.cancel() cannot interrupt: cancel_job() marked the
job "cancelled" while yt-dlp/ffmpeg kept running in the background (a
zombie process writing into a deleted staging dir, burning CPU and disk).

This test spawns a real (fake) yt-dlp subprocess through the production
code path and asserts that cancel_job() kills the process group.
"""

from __future__ import annotations

import asyncio
import os

import pytest

import app.services.download_service as ds


@pytest.mark.asyncio
async def test_cancel_kills_ytdlp_subprocess(monkeypatch, tmp_path):
    pidfile = tmp_path / "yt.pid"
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    fake = bin_dir / "yt-dlp"
    fake.write_text(
        f"#!/bin/sh\n"
        f'echo $$ > "{pidfile}"\n'
        f"while true; do sleep 1; done\n"
    )
    fake.chmod(0o755)
    monkeypatch.setenv("PATH", f"{bin_dir}:{os.environ.get('PATH', '')}")

    job = ds._new_job("track-cancel", "Title", "Artist", "", "mp3", "320")
    jid = job["id"]
    ds._jobs[jid] = job

    task = asyncio.create_task(
        ds._download_task(jid, "https://www.youtube.com/watch?v=aaaaaaaaaaa", "Artist")
    )
    ds._tasks[jid] = task

    # Wait until the fake yt-dlp process is actually running.
    for _ in range(100):
        if pidfile.exists():
            break
        await asyncio.sleep(0.02)
    assert pidfile.exists(), "fake yt-dlp never started"

    pid = int(pidfile.read_text().strip())
    os.kill(pid, 0)  # raises if already dead — must be alive here

    ok = await ds.cancel_job(jid)
    assert ok

    # The process must actually die (SIGKILL to its process group).
    for _ in range(200):  # up to ~4 s for the kernel to reap it
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            break
        await asyncio.sleep(0.02)
    with pytest.raises(ProcessLookupError):
        os.kill(pid, 0)

    assert ds._jobs[jid]["status"] == "cancelled"
