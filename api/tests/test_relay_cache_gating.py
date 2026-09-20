"""Whole-file gating for the relay cache tee.

A ranged relay (a seek, ``bytes=100000-``) must never be teed into the
cache: its bytes are a slice of the track, and promoting them produces a
truncated "durable" file that answers later plays — and every seek beyond
its end — with 416 forever. Only whole-file responses may be cached, and
a body that ends short of its promised size is discarded at publish time.
"""

from __future__ import annotations

import asyncio

import pytest

import app.routers.stream_router as sr
import app.services.stream_service as ss

# A unique id per test (set in each case) — the warm-cache directory is
# shared per test run, and reusing one id would make the later tests see
# `already_cached` from an earlier test's promotion and skip the tee.
TRACK_ID = "relaygat01"


class _FakeUpstream:
    """The slice of UpstreamStream the relay handler consumes."""

    def __init__(self, *, status: int, mime: str, rng, clen, payload: bytes) -> None:
        self.status_code = status
        self.mime = mime
        self._rng = rng
        self._clen = clen
        self._payload = payload
        self.headers: dict[str, str] = {}
        if clen is not None:
            self.headers["content-length"] = str(clen)
        if rng is not None:
            start, end, total = rng
            self.headers["content-range"] = f"bytes {start}-{end}/{total}"

    @property
    def content_length(self):
        return self._clen

    @property
    def content_range(self):
        return self._rng if self._rng is not None else (None, None, None)

    @property
    def covers_whole_file(self) -> bool:
        if self.status_code == 200:
            return True
        start, end, total = self.content_range
        return total is not None and start == 0 and end == total - 1

    async def iter_bytes(self):
        yield self._payload

    async def aclose(self):
        return None


class _FakeRequest:
    method = "GET"

    def __init__(self, range_header):
        self.headers = {"range": range_header} if range_header else {}


async def _drive(monkeypatch, upstream, track_id: str, range_header=None) -> int:
    """Run the relay handler against the fake upstream; return bytes relayed."""

    async def fake_open(url, range_header=None, timeout=30.0, read_timeout=60.0):
        return upstream

    async def none_resolve(tid):
        return "https://cdn.example/audio"

    monkeypatch.setattr(ss, "open_upstream", fake_open)
    monkeypatch.setattr(sr, "_resolve_direct_url", none_resolve)

    response = await sr._serve_direct_relay(track_id, _FakeRequest(range_header))
    assert response is not None
    total = 0
    async for chunk in response.body_iterator:
        total += len(chunk)
    return total


@pytest.fixture(autouse=True)
def _unique_id(request):
    global TRACK_ID
    TRACK_ID = f"relaygat{abs(hash(request.node.name)) % 100:02d}"
    yield


@pytest.fixture(autouse=True)
async def _clean_state():
    yield
    sr._remote_cache.clear()
    sr._failure_cache.clear()


@pytest.mark.asyncio
async def test_bounded_seek_relay_is_not_cached(monkeypatch):
    """A seek (`bytes=100000-`) must not write a partial file into the cache."""
    up = _FakeUpstream(
        status=206, mime="audio/mp4", rng=(100000, 1186832, 1186833),
        clen=1086833, payload=b"x" * 4096,
    )
    await _drive(monkeypatch, up, TRACK_ID, "bytes=100000-")

    assert sr._remote_cache_get(TRACK_ID) is None, (
        "a seek range was promoted to the cache — later plays would be truncated"
    )


@pytest.mark.asyncio
async def test_whole_file_200_relay_is_cached(monkeypatch):
    """A plain 200 whose body matches its Content-Length populates the cache."""
    up = _FakeUpstream(
        status=200, mime="audio/mp4", rng=None, clen=4096, payload=b"x" * 4096,
    )
    await _drive(monkeypatch, up, TRACK_ID)

    assert sr._remote_cache_get(TRACK_ID) is not None


@pytest.mark.asyncio
async def test_whole_file_206_relay_is_cached(monkeypatch):
    """A 206 spanning the entire track (bytes=0-) is also cacheable."""
    up = _FakeUpstream(
        status=206, mime="audio/mp4", rng=(0, 4095, 4096), clen=4096,
        payload=b"x" * 4096,
    )
    await _drive(monkeypatch, up, TRACK_ID)

    assert sr._remote_cache_get(TRACK_ID) is not None


@pytest.mark.asyncio
async def test_truncated_body_is_not_published(monkeypatch):
    """A body ending short of its promised size must never reach the cache."""
    before = set(sr._buffer_dir.glob(f"{TRACK_ID}.*.relay"))
    up = _FakeUpstream(
        status=200, mime="audio/mp4", rng=None, clen=8192,
        payload=b"x" * 4096,  # half of what was promised
    )
    await _drive(monkeypatch, up, TRACK_ID)

    assert sr._remote_cache_get(TRACK_ID) is None, (
        "a truncated body was published as a complete track"
    )
    # abort() removed this attempt's temp file: nothing new beyond the
    # pre-existing files (an in-memory cache entry from an earlier test in
    # the same run legitimately holds its file open on disk).
    after = set(sr._buffer_dir.glob(f"{TRACK_ID}.*.relay"))
    assert after <= before, f"abort() left temp files behind: {after - before}"
