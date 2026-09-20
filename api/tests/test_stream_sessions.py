"""Regression tests for the session-backed remote streaming path.

These lock in the semantics that were broken when the yt-dlp fill lived
inside the first HTTP response:

  1. Two concurrent GETs for the same remote track must share ONE yt-dlp
     fill (previously each spawned its own process, all writing the same
     buffer file and corrupting it).
  2. A client disconnecting mid-stream must NOT kill the shared fill and
     must NOT leave a truncated buffer promoted to the cache as "valid".
  3. A failed fill must not spawn a retry storm on subsequent requests.
  4. A bounded byte-range (seek) request during an in-progress fill waits for
     the complete file instead of spawning a second conflicting download,
     while an open-ended ``bytes=0-`` request — what a media element sends
     before it plays — is answered from the growing buffer straight away.

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


def _fake_fill(content: bytes, delay: float = 0.0, mime: str = "audio/mpeg"):
    """Return an async fake for ``_fill_buffer`` that writes `content` to
    dest, optionally after sleeping `delay` seconds.

    Mirrors the real signature: the fill reports the container it is producing
    through `on_mime` before it writes any audio, which is what a response
    awaits so it can advertise a truthful Content-Type.
    """

    async def _fill(track_id: str, dest, on_mime=None):
        if on_mime is not None:
            on_mime(mime)
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

    async def counting_fill(track_id: str, dest, on_mime=None):
        calls.append(track_id)
        if on_mime is not None:
            on_mime("audio/mpeg")
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

    async def gated_fill(track_id: str, dest, on_mime=None):
        if on_mime is not None:
            on_mime("audio/mpeg")
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

    async def failing_fill(track_id: str, dest, on_mime=None):
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
async def test_open_ended_range_from_zero_streams_without_waiting(client, monkeypatch):
    """`bytes=0-` must start flowing immediately, not after the whole fill.

    This is the regression test for the multi-second silence before playback:
    the opening request from a media element used to be treated as a seek, so
    the server waited for the entire yt-dlp download (up to 120 s) before
    answering — the user heard nothing until the track had been fetched.
    """
    monkeypatch.setattr(
        sr, "_fill_buffer", _fake_fill(PAYLOAD, delay=0.4)
    )

    resp = await client.get(
        f"/api/stream/{ID_A}/audio",
        headers={"Range": "bytes=0-"},
    )
    # 200 (not 206) on purpose: the size of a still-growing buffer cannot be
    # promised up front, and an honest 200 keeps the element playing
    # progressively instead of rejecting a Content-Range it cannot verify.
    assert resp.status_code == 200, resp.text
    assert resp.content == PAYLOAD


async def test_growing_buffer_advertises_the_container_it_is_streaming(client, monkeypatch):
    """The fallback path must not announce mp3 bytes as audio/mp4.

    The regression: a session was created with a hardcoded ``audio/mp4`` and
    the response headers were built from it before the fill had a chance to
    report the real container. On the transcoding fallback the body was mp3,
    so the server claimed the wrong type — and because the response also sets
    ``X-Content-Type-Options: nosniff``, nothing downstream could repair it.

    The session must instead wait for the fill's report, which every branch
    produces before writing audio.
    """
    monkeypatch.setattr(
        sr, "_fill_buffer", _fake_fill(PAYLOAD, delay=0.3, mime="audio/mpeg")
    )

    resp = await client.get(
        f"/api/stream/{ID_A}/audio",
        headers={"Range": "bytes=0-"},
    )

    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"].startswith("audio/mpeg"), (
        f"buffer was mpeg but the response said {resp.headers['content-type']}"
    )
    assert resp.content == PAYLOAD


@pytest.mark.asyncio
async def test_growing_buffer_mime_is_released_even_when_the_fill_fails(client, monkeypatch):
    """A failed fill must release the wait rather than stalling the response."""

    async def failing_fill(track_id: str, dest, on_mime=None):
        raise RuntimeError("simulated failure before any byte")

    monkeypatch.setattr(sr, "_fill_buffer", failing_fill)

    session = await sr._ensure_remote_session(ID_C)
    assert session is not None
    for _ in range(200):
        if session["done"].is_set():
            break
        await asyncio.sleep(0.02)

    # The fill never published a container, so the wait must have been released
    # by the fill finishing — not left to time out.
    assert session["mime_ready"].is_set()


async def test_bounded_range_during_fill_waits_for_complete_file(client, monkeypatch):
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
