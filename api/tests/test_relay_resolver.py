"""Tests for the relay resolver (Piped/Invidious fast path).

The resolver is best-effort by contract: any instance failure is silent,
a success is a plain URL string, and the OFF switch must short-circuit
before any network call. These tests pin all three behaviors with a
stubbed httpx client so no test touches the network.
"""

from __future__ import annotations

import pytest

import app.services.relay_resolver as relay


@pytest.fixture(autouse=True)
def _reset_state():
    relay._instances_cache = None
    relay._instances_at = 0.0
    relay._breaker_open_until = 0.0
    yield
    relay._instances_cache = None
    relay._instances_at = 0.0
    relay._breaker_open_until = 0.0


class _StubResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload or {}

    def json(self):
        return self._payload


class _StubClient:
    """Minimal httpx.AsyncClient stand-in keyed by URL substring."""

    def __init__(self, routes: dict[str, _StubResponse]):
        self._routes = routes
        self.requested: list[str] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, url, headers=None):
        self.requested.append(url)
        for fragment, res in self._routes.items():
            if fragment in url:
                if isinstance(res, Exception):
                    raise res
                return res
        return _StubResponse(status_code=404)


@pytest.mark.asyncio
async def test_disabled_short_circuits_before_network(monkeypatch):
    monkeypatch.setattr(relay.settings, "RELAY_RESOLVER_ENABLED", False)
    called = False

    async def _boom(*a, **k):  # any network call means the switch leaked
        nonlocal called
        called = True
        return None

    monkeypatch.setattr(relay, "_fetch_instances", _boom)
    assert await relay.resolve("dQw4w9WgXcQ") is None
    assert not called, "the OFF switch must short-circuit before any network call"


@pytest.mark.asyncio
async def test_piped_success_returns_highest_bitrate(monkeypatch):
    monkeypatch.setattr(relay.settings, "RELAY_RESOLVER_ENABLED", True)

    async def _instances():
        return (["https://piped.test"], [])

    monkeypatch.setattr(relay, "_fetch_instances", _instances)

    payload = {
        "audioStreams": [
            {"url": "https://pipedproxy.test/x-low", "mimeType": "audio/mp4", "bitrate": 48000},
            {"url": "https://pipedproxy.test/x-hi", "mimeType": "audio/mp4", "bitrate": 129000},
            {"url": "https://pipedproxy.test/video", "mimeType": "video/mp4", "bitrate": 999999},
        ]
    }
    client = _StubClient({"piped.test/streams/": _StubResponse(payload=payload)})
    monkeypatch.setattr(relay.httpx, "AsyncClient", lambda **k: client)

    url = await relay.resolve("dQw4w9WgXcQ")
    assert url == "https://pipedproxy.test/x-hi"
    # Video streams must never be picked even at a higher bitrate.
    assert "video" not in (url or "")


@pytest.mark.asyncio
async def test_invidious_fallback_when_piped_dead(monkeypatch):
    monkeypatch.setattr(relay.settings, "RELAY_RESOLVER_ENABLED", True)

    async def _instances():
        return (["https://piped.test"], ["https://inv.test"])

    monkeypatch.setattr(relay, "_fetch_instances", _instances)

    payload = {
        "adaptiveFormats": [
            {"type": "audio/mp4", "itag": 140, "bitrate": 129000},
            {"type": "video/webm", "itag": 299, "bitrate": 3000000},
        ]
    }
    client = _StubClient({
        # Piped answers 502 — dead, exactly like today's real instances.
        "piped.test/streams/": _StubResponse(status_code=502),
        "inv.test/api/v1/videos/": _StubResponse(payload=payload),
    })
    monkeypatch.setattr(relay.httpx, "AsyncClient", lambda **k: client)

    url = await relay.resolve("dQw4w9WgXcQ")
    assert url == "https://inv.test/latest_version?id=dQw4w9WgXcQ&itag=140"


@pytest.mark.asyncio
async def test_total_failure_is_silent_none(monkeypatch):
    monkeypatch.setattr(relay.settings, "RELAY_RESOLVER_ENABLED", True)

    async def _instances():
        return (["https://piped.test"], ["https://inv.test"])

    monkeypatch.setattr(relay, "_fetch_instances", _instances)

    client = _StubClient({
        "piped.test": _StubResponse(status_code=502),
        "inv.test": RuntimeError("bot wall"),
    })
    monkeypatch.setattr(relay.httpx, "AsyncClient", lambda **k: client)

    assert await relay.resolve("dQw4w9WgXcQ") is None


@pytest.mark.asyncio
async def test_breaker_skips_probes_after_total_failure(monkeypatch):
    """A fruitless sweep must open the breaker: the next call is a no-op.

    Without this, a dead relay fleet taxes every cold track with the full
    dead-instance sweep (~10 s measured) before yt-dlp even starts.
    """
    monkeypatch.setattr(relay.settings, "RELAY_RESOLVER_ENABLED", True)

    async def _instances():
        return (["https://piped.test"], [])

    monkeypatch.setattr(relay, "_fetch_instances", _instances)

    client = _StubClient({"piped.test": _StubResponse(status_code=502)})
    monkeypatch.setattr(relay.httpx, "AsyncClient", lambda **k: client)

    assert await relay.resolve("dQw4w9WgXcQ") is None
    assert relay._breaker_open_until > 0, "a fruitless sweep must open the breaker"

    client.requested.clear()
    assert await relay.resolve("dQw4w9WgXcQ") is None
    assert client.requested == [], "the breaker must skip all probes while open"


@pytest.mark.asyncio
async def test_success_resets_breaker(monkeypatch):
    """After the cooldown expires, a working instance clears the breaker."""
    monkeypatch.setattr(relay.settings, "RELAY_RESOLVER_ENABLED", True)
    relay._breaker_open_until = 1.0  # expired long ago (monotonic >> 1.0)

    async def _instances():
        return (["https://piped.test"], [])

    monkeypatch.setattr(relay, "_fetch_instances", _instances)

    payload = {"audioStreams": [
        {"url": "https://pipedproxy.test/x", "mimeType": "audio/mp4", "bitrate": 96000}
    ]}
    client = _StubClient({"piped.test/streams/": _StubResponse(payload=payload)})
    monkeypatch.setattr(relay.httpx, "AsyncClient", lambda **k: client)

    url = await relay.resolve("dQw4w9WgXcQ")
    assert url == "https://pipedproxy.test/x"
    assert relay._breaker_open_until == 0.0, "a hit must reset the breaker"
