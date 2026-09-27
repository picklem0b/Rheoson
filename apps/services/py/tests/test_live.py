"""Live checks against the real service — skipped unless ``RHEOSON_LIVE=1``.

Everything else in this suite is hermetic: a stub ``yt-dlp``, a temp data
directory, no network. That is what keeps CI honest and fast, and it is also
why the one class of failure that actually breaks this app — YouTube changing
something — cannot be caught by the rest of the suite. These two tests are the
deliberate exception: they talk to the real thing, they are skipped by default,
and they are meant to be run by hand when a download is reported broken or
before a release.

    RHEOSON_LIVE=1 uv run python -m pytest tests/test_live.py -q

They take about fifteen seconds and move a few megabytes. Nothing here asserts
a *specific* track's metadata (that would break the moment a video is
re-uploaded); they assert the pipeline: a URL that plays, and a file that lands
with a trustworthy identity.
"""

from __future__ import annotations

import os
import time
from pathlib import Path

import httpx
import pytest

from app.services import downloads, identity, library, resolve

#: A long-lived video, overridable so a run can target the track a user
#: reported rather than the one that happened to be typed here.
TRACK_ID = "dQw4w9WgXcQ"

REQUEST_TIMEOUT = 60.0
#: A download over a phone uplink is not fast; this bounds the *test*, not the
#: engine (which has its own timeout).
DOWNLOAD_DEADLINE = 120.0
#: Only the opening bytes are fetched — a player starts on the first frames,
#: and this test must not pull a whole song every run.
OPENING_BYTES = 4096

pytestmark = pytest.mark.skipif(
    os.environ.get("RHEOSON_LIVE") != "1",
    reason="live network test — set RHEOSON_LIVE=1 to run it",
)


def test_resolved_url_serves_a_playable_range() -> None:
    """Resolution must end in bytes, not merely in a URL.

    This is the check that would have caught a URL shape the CDN refuses: the
    relay and the server both ask with a range, so a resolve that returns
    something only an unbounded request could fetch is a broken playback path
    that no stub notices.
    """
    url = resolve.resolve_direct_url_sync(TRACK_ID, use_cache=False)
    assert url, "every player client declined the track"

    response = httpx.get(
        url,
        headers={
            "User-Agent": resolve.UA_DESKTOP,
            "Range": f"bytes=0-{OPENING_BYTES - 1}",
        },
        timeout=REQUEST_TIMEOUT,
        follow_redirects=True,
    )

    assert response.status_code == 206, f"range request answered {response.status_code}"
    assert response.headers.get("content-range", "").startswith("bytes 0-")
    body = response.content
    assert len(body) == OPENING_BYTES
    # An ISO base-media file starts with a size-prefixed `ftyp` box. Checking the
    # container rather than the declared mime is the point: a CDN error page is
    # 200-shaped and full of text.
    assert body[4:8] == b"ftyp", f"not a media container: {body[:32]!r}"


def test_live_download_lands_a_file_that_the_library_trusts(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    """The whole download path, end to end, against the real service.

    Asserted in the order a user experiences it: progress moves, the job
    completes, the file is on disk under Artist/Title, the identity map resolves
    the videoId to it, and the library lists it under that same id.
    """
    monkeypatch.setenv("ENGINE_DATA_DIR", str(tmp_path))
    identity.reset_caches()
    library.invalidate()
    manager = downloads.DownloadManager()

    try:
        job = manager.create(owner="live_test", track_id=TRACK_ID)

        deadline = time.time() + DOWNLOAD_DEADLINE
        seen_progress = False
        while time.time() < deadline:
            current = manager.get(job.id)
            seen_progress = seen_progress or current["progress"] > 0 or current["total_bytes"] is not None
            if not current["active"]:
                break
            time.sleep(0.5)

        final = manager.get(job.id)
        assert final["status"] == downloads.COMPLETED, f"{final['status']}: {final['error']}"
        assert seen_progress, "a download that never reports progress has no progress bar"
        assert final["progress"] == 100.0
        assert final["file_path"], "a completed job must name the file it produced"

        landed = Path(final["file_path"])
        assert landed.is_file() and landed.stat().st_size > 0
        assert final["title"] and final["artist"]

        mapped = identity.lookup_by_video(TRACK_ID)
        assert mapped is not None and mapped["file_path"] == str(landed)

        listed = [t for t in library.scan(force=True) if t["id"] == TRACK_ID]
        assert listed, "the downloaded track must be visible to the library immediately"
        assert listed[0]["isDownloaded"] is True
    finally:
        manager.shutdown()
