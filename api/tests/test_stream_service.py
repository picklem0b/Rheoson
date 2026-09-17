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
async def test_relay_propagates_a_genuine_upstream_failure(monkeypatch):
    """A real relay error surfaces (so the client retries) and caches nothing."""
    import app.routers.stream_router as sr

    upstream = _FakeUpstream(
        PAYLOAD,
        status_code=206,
        content_range=f"bytes 0-{len(PAYLOAD) - 1}/{len(PAYLOAD)}",
        fail_exc=RuntimeError("upstream exploded"),
    )
    resp, _ = await _relay(monkeypatch, upstream)

    with pytest.raises(RuntimeError):
        _ = b"".join([chunk async for chunk in resp.body_iterator])

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
