"""Regression tests for the session-backed remote streaming path.

These lock in the semantics that were broken when the yt-dlp fill lived
inside the first HTTP response:

  1. Two concurrent GETs for the same remote track must share ONE yt-dlp
     fill (previously each spawned its own process, all writing the same
     buffer file and corrupting it).
  2. A client disconnecting mid-stream must NOT kill the shared fill and
     must NOT leave a truncated buffer promoted to the cache as "valid".
  3. A failed fill must not spawn a retry storm on subsequent requests.
  4. A byte-range (seek) request during an in-progress fill waits for the
     complete file instead of spawning a second conflicting download.

yt-dlp itself is never invoked: ``_fill_buffer`` is monkeypatched with a
deterministic fake writer.
"""

from __future__ import annotations

import asyncio

import pytest

import app.routers.stream_router as sr

# 11-char ids — valid remote shape so the route takes the remote path.
ID_A = "aaaaaaaaaaa"
ID_B = "bbbbbbbbbbb"
ID_C = "ccccccccccc"
ID_D = "ddddddddddd"

PAYLOAD = bytes(range(256)) * 16  # 4096 bytes of deterministic audio


def _fake_fill(content: bytes, delay: float = 0.0):
    """Return an async fake for ``_fill_buffer`` that writes `content` to
    dest, optionally after sleeping `delay` seconds."""

    async def _fill(track_id: str, dest):
        if delay:
            await asyncio.sleep(delay)
        with open(dest, "wb") as f:
            f.write(content)

    return _fill


@pytest.fixture(autouse=True)
async def _reset_stream_state():
    """Clear module-level stream state between tests and cancel any
    lingering session fill tasks so a monkeypatched fake is never replaced
    by the real yt-dlp fill mid-test."""
    yield
    pending = [
        s["task"]
        for s in list(sr._remote_sessions.values())
        if not s["done"].is_set()
    ]
    for t in pending:
        t.cancel()
    if pending:
        await asyncio.gather(*pending, return_exceptions=True)
    sr._remote_sessions.clear()
    sr._remote_cache.clear()
    sr._failure_cache.clear()


@pytest.mark.asyncio
async def test_concurrent_get_share_single_fill(client, monkeypatch):
    calls: list[str] = []

    async def counting_fill(track_id: str, dest):
        calls.append(track_id)
        with open(dest, "wb") as f:
            f.write(PAYLOAD)

    monkeypatch.setattr(sr, "_fill_buffer", counting_fill)

    url = f"/api/stream/{ID_A}/audio"
    r1, r2 = await asyncio.gather(client.get(url), client.get(url))

    assert r1.status_code == 200, r1.text
    assert r2.status_code == 200, r2.text
    assert r1.content == PAYLOAD
    assert r2.content == PAYLOAD
    # Exactly one yt-dlp fill for two simultaneous listeners
    assert calls == [ID_A]


@pytest.mark.asyncio
async def test_client_disconnect_does_not_cache_partial_or_kill_fill(client, monkeypatch):
    started = asyncio.Event()
    release = asyncio.Event()

    async def gated_fill(track_id: str, dest):
        with open(dest, "wb") as f:
            f.write(PAYLOAD[:100])
        started.set()
        await release.wait()   # hold the fill open past the disconnect
        with open(dest, "ab") as f:
            f.write(PAYLOAD[100:])

    monkeypatch.setattr(sr, "_fill_buffer", gated_fill)

    url = f"/api/stream/{ID_B}/audio"

    # Drive the server-side response generator directly (same code a dropped
    # HTTP client triggers): the fill is provably mid-write (first 100 bytes
    # on disk, rest blocked), we consume one chunk, then abort the stream.
    session = await sr._ensure_remote_session(ID_B)
    resp = await sr._serve_session_stream(ID_B, session)
    gen = resp.body_iterator

    await asyncio.wait_for(started.wait(), timeout=2.0)
    chunk = await asyncio.wait_for(gen.__anext__(), timeout=2.0)
    assert chunk == PAYLOAD[:100]
    await gen.aclose()  # simulate the client dropping mid-stream

    # The background fill must keep running to completion on its own...
    release.set()
    for _ in range(200):  # up to ~4 s
        s = sr._remote_sessions.get(ID_B)
        if s is not None and s["done"].is_set():
            break
        await asyncio.sleep(0.02)
    assert sr._remote_sessions[ID_B]["done"].is_set()

    # ...and the completed buffer must be served in full — never a 100-byte
    # stub that got cached as a "valid" stream.
    r2 = await client.get(url)
    assert r2.status_code == 200, r2.text
    assert r2.content == PAYLOAD

    cached = sr._remote_cache_get(ID_B)
    assert cached is not None and cached.stat().st_size == len(PAYLOAD)


@pytest.mark.asyncio
async def test_failed_fill_does_not_retry_storm(client, monkeypatch):
    calls: list[str] = []

    async def failing_fill(track_id: str, dest):
        calls.append(track_id)
        raise RuntimeError("simulated yt-dlp failure")

    monkeypatch.setattr(sr, "_fill_buffer", failing_fill)

    url = f"/api/stream/{ID_C}/audio"

    # First request triggers the (failing) fill. Depending on timing the
    # response is a truncated 200 or a clean 502 — swallow either.
    try:
        await client.get(url)
    except Exception:
        pass

    # Second request: the session already finished as failed → clean 502.
    r2 = await client.get(url)
    assert r2.status_code == 502

    # Third request inside the failure-cache window → 502, no new spawn.
    r3 = await client.get(url)
    assert r3.status_code == 502

    # One fill attempt total across three requests — no retry storm.
    assert calls == [ID_C]


@pytest.mark.asyncio
async def test_range_request_during_fill_waits_for_complete_file(client, monkeypatch):
    monkeypatch.setattr(
        sr, "_fill_buffer", _fake_fill(PAYLOAD, delay=0.3)
    )

    # Fire a range request while the fill is still in progress.
    resp = await client.get(
        f"/api/stream/{ID_D}/audio",
        headers={"Range": "bytes=0-9"},
    )
    assert resp.status_code == 206, resp.text
    assert resp.content == PAYLOAD[:10]
    assert resp.headers.get("content-range") == f"bytes 0-9/{len(PAYLOAD)}"
