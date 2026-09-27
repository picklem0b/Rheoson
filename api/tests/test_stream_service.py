"""Unit and route tests for the streaming service and its relay fast path.

The relay is the piece that decides whether pressing play produces sound in a
fraction of a second or after a full download, so these tests pin its two
contracts:

  1. The client's Range header is forwarded upstream and the CDN's own
     Content-Range / Content-Length are mirrored back untouched. A player
     needs both to know a track's duration and to seek.
  2. A relayed full body is promoted into the durable cache, and a partial or
     abandoned one never is — a truncated file cached as valid would serve a
     broken track forever after.

No network is touched: ``open_upstream`` is replaced with a fake that behaves
like a CDN response.
"""

from __future__ import annotations

import time

import pytest

from app.services import stream_service as ss

ID = "aaaaaaaaaaa"
PAYLOAD = bytes(range(256)) * 8  # 2048 bytes


# ── Pure helpers ──────────────────────────────────────────────


@pytest.mark.parametrize(
    "header,expected",
    [
        ("bytes=0-", True),
        ("bytes=0- ", True),
        ("bytes=0-9", False),
        ("bytes=0-0", False),
        ("bytes=100-", False),
        ("bytes=1000-2000", False),
        (None, False),
        ("", False),
        ("items=0-", False),
        ("garbage", False),
    ],
)
def test_is_whole_file_range(header, expected):
    """Only an open-ended request from byte zero may be answered early.

    A bounded range carries a promise about exactly which bytes come back, so
    treating `bytes=0-9` as a progressive stream would be a protocol lie.
    """
    assert ss.is_whole_file_range(header) is expected


@pytest.mark.parametrize(
    "header,expected",
    [
        ("bytes=0-", 0),
        ("bytes=4096-8191", 4096),
        ("bytes=5-", 5),
        (None, None),
        ("items=0-", None),
        ("bytes=abc-", None),
    ],
)
def test_parse_range_start(header, expected):
    assert ss.parse_range_start(header) == expected


@pytest.mark.parametrize(
    "header,expected",
    [
        ("bytes 0-1023/2048", (0, 1023, 2048)),
        ("bytes 100-199/*", (100, 199, None)),
        (None, (None, None, None)),
        ("nonsense", (None, None, None)),
    ],
)
def test_parse_content_range(header, expected):
    assert ss.parse_content_range(header) == expected


def test_mime_from_response_prefers_the_url():
    """The signed URL declares the container; trust it over a generic header."""
    url = "https://cdn.example/videoplayback?mime=audio%2Fmp4&expire=1"
    assert ss.mime_from_response(url, "application/octet-stream") == "audio/mp4"


def test_mime_from_response_falls_back_to_the_header_then_mp3():
    assert ss.mime_from_response("https://cdn.example/x", "audio/webm") == "audio/webm"
    assert ss.mime_from_response("https://cdn.example/x", "") == "audio/mpeg"


# ── Client / format ladder ────────────────────────────────────


def test_format_selector_accepts_a_muxed_fallback():
    """The selector must degrade gracefully, not demand audio-only.

    The mobile clients increasingly expose only muxed formats; a selector that
    stops at `bestaudio` reports "Requested format is not available" for those
    videos even though a perfectly usable stream exists.
    """
    parts = ss.FORMAT_SELECTOR.split("/")
    assert parts[0].startswith("bestaudio")
    assert parts[-1] == "best", "a muxed fallback must always be available"


def test_client_ladder_starts_with_default_and_avoids_the_js_challenge():
    ladder = ss.client_attempts()
    assert ladder[0] == [], "the default client is tried first"
    flat = [a[0] for a in ladder if a]
    assert "youtube:player_client=android" in flat
    assert "youtube:player_client=android_vr" in flat


def test_ladder_drops_clients_that_can_no_longer_return_a_format():
    """Clients that only answer with SABR/PO-token formats are dead weight.

    Measured against two tracks, `ios`, `mweb` and `web` failed every attempt
    with "Requested format is not available" — no `-f` selector can pick a
    SABR-only answer. Each one still cost a subprocess spawn and a full
    extraction before the ladder moved on, so they only made the failure path
    slower. Pin their absence so they cannot creep back without evidence.
    """
    flat = [a[0] for a in ss.client_attempts() if a]
    for dead in ("youtube:player_client=ios", "youtube:player_client=mweb",
                 "youtube:player_client=web"):
        assert dead not in flat, f"{dead} cannot return a selectable format"


def test_ladder_stays_bounded():
    """Every rung is a subprocess; the ladder must not grow without limit."""
    assert len(ss.client_attempts()) <= 5


@pytest.mark.parametrize(
    "text,expected",
    [
        ("ERROR: [youtube] x: Requested format is not available.", True),
        ("ERROR: Sign in to confirm you're not a bot. Use --cookies", True),
        ("ERROR: [youtube] x: The page needs to be reloaded.", True),
        ("ERROR: [youtube] x: Unable to extract player response", True),
        ("ERROR: HTTP Error 403: Forbidden", True),
        ("ERROR: unable to write data to disk: No space left on device", False),
        ("ERROR: [Errno -3] Temporary failure in name resolution", False),
        ("", False),
    ],
)
def test_is_extractor_failure(text, expected):
    """Only client-level refusals are worth another subprocess."""
    assert ss.is_extractor_failure(text) is expected


@pytest.mark.parametrize(
    "text,expected",
    [
        ("ERROR: unable to download video data: HTTP Error 403: Forbidden", True),
        ("ERROR: HTTP Error 429: Too Many Requests", True),
        ("ERROR: HTTP Error 503: Service Unavailable", True),
        ("ERROR: [youtube] x: Requested format is not available.", False),
        ("ERROR: Sign in to confirm you're not a bot.", False),
        ("ERROR: unable to write data to disk: No space left on device", False),
        ("", False),
    ],
)
def test_is_transient_media_refusal(text, expected):
    """A refused transfer is a retry, not a reason to change player client."""
    assert ss.is_transient_media_refusal(text) is expected


def test_the_two_failure_readings_overlap_on_a_refused_transfer():
    """Pin the overlap that decides which remedy runs first.

    `http error 403` is deliberately in both marker sets, so callers have to
    choose: retry the same client, or switch. The download ladder checks this
    one first, and if the overlap ever disappears silently that ordering would
    become dead code rather than the fix it is.
    """
    text = "ERROR: unable to download video data: HTTP Error 403: Forbidden"
    assert ss.is_transient_media_refusal(text) is True
    assert ss.is_extractor_failure(text) is True


# ── Fake CDN ──────────────────────────────────────────────────


class _FakeUpstream:
    """Minimal stand-in for stream_service.UpstreamStream."""

    def __init__(
        self,
        body: bytes,
        *,
        status_code: int = 206,
        content_range: str | None = None,
        mime: str = "audio/mp4",
        fail_midway: bool = False,
        fail_exc: BaseException | None = None,
    ) -> None:
        self._body = body
        self._fail_midway = fail_midway
        self._fail_exc = fail_exc
        self.status_code = status_code
        self.mime = mime
        self.headers = {"content-type": mime}
        if content_range:
            self.headers["content-range"] = content_range
        self.headers["content-length"] = str(len(body))
        self.closed = False

    @property
    def content_range(self):
        return ss.parse_content_range(self.headers.get("content-range"))

    @property
    def covers_whole_file(self) -> bool:
        if self.status_code == 200:
            return True
        start, end, total = self.content_range
        return total is not None and start == 0 and end == total - 1

    async def iter_bytes(self):
        half = len(self._body) // 2
        yield self._body[:half]
        if self._fail_exc is not None:
            raise self._fail_exc
        if self._fail_midway:
            raise ConnectionResetError("upstream dropped")
        yield self._body[half:]

    async def aclose(self):
        self.closed = True


@pytest.fixture(autouse=True)
def _isolated_stream_state(tmp_path, monkeypatch):
    """Point buffers at tmp_path and clear shared caches between tests."""
    monkeypatch.setattr(ss, "_direct_url_cache", {}, raising=False)
    monkeypatch.setattr(ss, "_direct_url_cache", {})
    import app.routers.stream_router as sr

    monkeypatch.setattr(sr, "_buffer_dir", tmp_path)
    sr._remote_cache.clear()
    yield
    sr._remote_cache.clear()


async def _relay(monkeypatch, upstream, *, range_header=None):
    """Run the relay route with a fake CDN in place of open_upstream."""
    import app.routers.stream_router as sr

    async def _fake_resolve(track_id):
        return "https://cdn.example/videoplayback?mime=audio%2Fmp4"

    async def _fake_open(url, range_header_arg=None, **kwargs):
        _fake_open.range_seen = range_header_arg
        return upstream

    monkeypatch.setattr(sr, "_resolve_direct_url", _fake_resolve)
    monkeypatch.setattr(ss, "open_upstream", _fake_open)

    class _Req:
        def __init__(self, headers):
            self.headers = headers

    incoming = {"range": range_header} if range_header else {}
    resp = await sr._serve_direct_relay(ID, _Req(incoming))
    return resp, _fake_open


@pytest.mark.asyncio
async def test_relay_forwards_range_and_mirrors_cdn_framing(monkeypatch):
    """The client's Range goes upstream and the CDN's framing comes back.

    Without this the browser cannot compute a duration and cannot seek: an
    open-ended stream leaves it buffering blind, which is why playback used to
    stall until the whole track had been fetched.
    """
    upstream = _FakeUpstream(
        PAYLOAD,
        status_code=206,
        content_range=f"bytes 0-{len(PAYLOAD) - 1}/{len(PAYLOAD)}",
    )
    resp, open_fn = await _relay(monkeypatch, upstream, range_header="bytes=0-")

    assert open_fn.range_seen == "bytes=0-"
    assert resp.status_code == 206
    assert resp.media_type == "audio/mp4"
    assert resp.headers["content-range"] == f"bytes 0-{len(PAYLOAD) - 1}/{len(PAYLOAD)}"
    assert resp.headers["content-length"] == str(len(PAYLOAD))
    assert resp.headers["accept-ranges"] == "bytes"

    body = b"".join([chunk async for chunk in resp.body_iterator])
    assert body == PAYLOAD
    assert upstream.closed


@pytest.mark.asyncio
async def test_relay_promotes_a_full_body_into_the_cache(monkeypatch):
    """Only the first listener should ever pay for the network."""
    import app.routers.stream_router as sr

    upstream = _FakeUpstream(
        PAYLOAD,
        status_code=206,
        content_range=f"bytes 0-{len(PAYLOAD) - 1}/{len(PAYLOAD)}",
    )
    resp, _ = await _relay(monkeypatch, upstream)

    _ = b"".join([chunk async for chunk in resp.body_iterator])

    cached = sr._remote_cache_get(ID)
    assert cached is not None, "a fully relayed track must be cached"
    assert cached.read_bytes() == PAYLOAD


@pytest.mark.asyncio
async def test_relay_discards_a_body_that_fails_midway(monkeypatch):
    """A truncated relay must never be promoted as a valid stream.

    A failure the client caused (it hung up) is swallowed — the listener is
    gone and there is nobody to report to — but the half-written file must
    still be removed so the next request starts clean.
    """
    import app.routers.stream_router as sr

    upstream = _FakeUpstream(
        PAYLOAD,
        status_code=206,
        content_range=f"bytes 0-{len(PAYLOAD) - 1}/{len(PAYLOAD)}",
        fail_exc=ConnectionResetError("client went away"),
    )
    resp, _ = await _relay(monkeypatch, upstream)

    consumed = b"".join([chunk async for chunk in resp.body_iterator])
    assert consumed == PAYLOAD[: len(PAYLOAD) // 2]

    assert sr._remote_cache_get(ID) is None
    assert list(sr._buffer_dir.glob(f"{ID}.*.relay")) == [], \
        "aborted relays must clean up their temp file"


@pytest.mark.asyncio
async def test_relay_diagnoses_a_genuine_upstream_failure(monkeypatch, caplog):
    """A real relay error is diagnosed, not thrown at the client.

    Updated contract (the traceback.log incident): the old relay let the
    exception escape, so uvicorn flagged a Content-Length shortfall and the
    operator got a giant raw traceback (twice) for what is an upstream
    failure, not an app bug. The guard now logs one structured warning —
    stream.relay.upstream_died — arms the duplicate-traceback suppression,
    and ends the response cleanly. The delivered bytes still flow; nothing
    partial is cached.
    """
    import logging

    import app.routers.stream_router as sr
    from app.core import logging_config as lc

    lc._suppress_until[0] = 0.0
    upstream = _FakeUpstream(
        PAYLOAD,
        status_code=206,
        content_range=f"bytes 0-{len(PAYLOAD) - 1}/{len(PAYLOAD)}",
        fail_exc=RuntimeError("upstream exploded"),
    )
    resp, _ = await _relay(monkeypatch, upstream)

    consumed = bytearray()
    with caplog.at_level(logging.WARNING):
        _ = b"".join([chunk async for chunk in resp.body_iterator if chunk and (consumed.extend(chunk) or True)])

    assert bytes(consumed) == PAYLOAD[: len(PAYLOAD) // 2], "delivered bytes must still flow before the clean end"
    assert any(
        "stream.relay.upstream_died" in r.getMessage() for r in caplog.records
    ), "the upstream death was never diagnosed in the log"
    assert lc._suppress_until[0] > time.monotonic(), "duplicate-traceback suppression was not armed"

    assert sr._remote_cache_get(ID) is None
    assert list(sr._buffer_dir.glob(f"{ID}.*.relay")) == []


@pytest.mark.asyncio
async def test_relay_is_skipped_when_no_direct_url(monkeypatch):
    """No CDN URL means the caller falls back instead of raising."""
    import app.routers.stream_router as sr

    async def _none(track_id):
        return None

    monkeypatch.setattr(sr, "_resolve_direct_url", _none)

    class _Req:
        headers: dict = {}

    assert await sr._serve_direct_relay(ID, _Req()) is None


@pytest.mark.asyncio
async def test_relay_reports_unavailable_when_the_cdn_refuses(monkeypatch):
    """A rejected/expired signature must drop the URL and fall back."""
    import app.routers.stream_router as sr

    async def _resolve(track_id):
        return "https://cdn.example/dead"

    async def _boom(url, range_header=None, **kwargs):
        raise ss.UpstreamError("CDN returned 403")

    monkeypatch.setattr(sr, "_resolve_direct_url", _resolve)
    monkeypatch.setattr(ss, "open_upstream", _boom)
    ss._direct_url_cache[ID] = ("https://cdn.example/dead", 1e12)

    class _Req:
        headers: dict = {}

    assert await sr._serve_direct_relay(ID, _Req()) is None
    assert ss.cached_direct_url(ID) is None, "an expired URL must not be reused"
