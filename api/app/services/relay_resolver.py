"""Relay resolver — pre-extracted stream URLs from Piped/Invidious instances.

This is the "instant play" trick borrowed from relay projects like Verome:
public Piped/Invidious instances cache YouTube extractions across all of
their users, so asking one for an existing track's audio URL costs a single
fast HTTP round trip (~1 s) instead of a full local yt-dlp extraction
(~12 s cold on a phone).

The trade — and why this is a *rung*, not the engine:

* Instances are third-party volunteers. They get rate-limited, bot-walled
  and shut down without notice (measured on 2026-09-28: 9 of 9 Piped
  instances on the popular list failed from this network). Rheoson must
  never depend on them — the yt-dlp ladder below the relay stays the
  source of truth.
* Returned URLs are the instance's proxy URLs; they rotate, so they are
  cached with the same treat-expiry-pessimistically contract as CDN URLs:
  any downstream refusal forgets the entry and falls through.

Callers: `stream_router._resolve_direct_url` (between the URL cache and
the yt-dlp ladder) and `download_service` (last-resort fallback before a
job is failed). Both treat None as "no answer — keep the normal path".
"""

from __future__ import annotations

import time
from typing import Optional

import httpx
import structlog

from app.core.config import settings

log = structlog.get_logger()

#: Static instance fallbacks, used when the dynamic list cannot be fetched.
#: Kept short on purpose — every dead entry costs its timeout on the failure
#: path, and the dynamic list is the primary source anyway.
_PIPED_INSTANCES = (
    "https://api.piped.private.coffee",
    "https://pipedapi.adminforge.de",
    "https://pipedapi.kavin.rocks",
    "https://pipedapi.leptons.xyz",
)
_INVIDIOUS_INSTANCES = (
    "https://inv.nadeko.net",
    "https://invidious.jing.rocks",
)

#: How long the dynamic instance list lives. The list changes as instances
#: appear and die; five minutes matches the reference implementations.
_INSTANCE_LIST_TTL = 5 * 60

#: Per-instance HTTP budget. The relay's whole value is speed — an instance
#: that needs longer than this is treated as dead, not waited on.
_INSTANCE_TIMEOUT = 4.0

#: How many instances are tried per service before giving up. Bounding this
#: keeps the worst case (every entry dead) at a few seconds, not minutes.
_MAX_ATTEMPTS_PER_SERVICE = 3

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# ── Instance discovery ────────────────────────────────────────

_instances_cache: tuple[list[str], list[str]] | None = None
_instances_at = 0.0

# Circuit breaker: a full sweep that answers nothing proves the relay fleet
# is dead (bot-walls, shutdowns, network blocks). Re-probing every dead
# instance on every cold track would add ~10 s of pure latency before the
# yt-dlp ladder even starts, so after one fruitless sweep the resolver
# steps aside for _BREAKER_COOLDOWN and lets yt-dlp work uninterrupted.
_breaker_open_until = 0.0
_BREAKER_COOLDOWN = 10 * 60


async def _fetch_instances() -> tuple[list[str], list[str]]:
    """Piped + Invidious instance lists, dynamic first, static as fallback."""
    global _instances_cache, _instances_at
    now = time.monotonic()
    if _instances_cache is not None and now - _instances_at < _INSTANCE_LIST_TTL:
        return _instances_cache

    piped: list[str] = []
    invidious: list[str] = []
    try:
        async with httpx.AsyncClient(timeout=_INSTANCE_TIMEOUT) as client:
            res = await client.get(
                "https://raw.githubusercontent.com/n-ce/Uma/main/dynamic_instances.json"
            )
            data = res.json()
            # Prefer HTTPS-only entries: a mixed-content instance URL would
            # fail the relayed fetch later anyway.
            piped = [u for u in data.get("piped", []) if u.startswith("https://")]
            invidious = [u for u in data.get("invidious", []) if u.startswith("https://")]
    except Exception as e:  # noqa: BLE001 — the static list is the fallback
        log.debug("relay.instances_dynamic_failed", error=str(e))

    if not piped:
        piped = list(_PIPED_INSTANCES)
    if not invidious:
        invidious = list(_INVIDIOUS_INSTANCES)

    _instances_cache = (piped, invidious)
    _instances_at = now
    return _instances_cache


# ── Resolution ────────────────────────────────────────────────


def _best_piped_audio(streams: list[dict]) -> Optional[str]:
    """Highest-bitrate audio URL from a Piped /streams payload."""
    audio = [
        s for s in streams
        if (s.get("mimeType") or "").startswith("audio") and s.get("url")
    ]
    if not audio:
        return None
    best = max(audio, key=lambda s: s.get("bitrate") or 0)
    return best["url"]


def _best_invidious_audio(formats: list[dict], instance: str, video_id: str) -> Optional[str]:
    """Audio URL from an Invidious /api/v1/videos payload.

    Invidious exposes audio through ``latest_version`` (which the instance
    itself proxies with Range support); the raw googlevideo ``url`` in the
    payload is frequently IP-locked to the instance, so it is not usable
    from here.
    """
    audio = [
        f for f in formats
        if (f.get("type") or "").startswith("audio") and f.get("itag")
    ]
    if not audio:
        return None
    best = max(audio, key=lambda f: f.get("bitrate") or 0)
    return f"{instance}/latest_version?id={video_id}&itag={best['itag']}"


async def resolve(track_id: str) -> Optional[str]:
    """One audio URL for `track_id` from a healthy relay instance, or None.

    Tries Piped instances first (they proxy audio with Range support and
    rarely bot-wall), then Invidious. Any single success wins; every
    failure is a quiet debug log — the caller has a full yt-dlp ladder
    behind this, so relay problems must not add noise.
    """
    if not settings.RELAY_RESOLVER_ENABLED:
        return None

    global _breaker_open_until
    now = time.monotonic()
    if now < _breaker_open_until:
        return None

    piped, invidious = await _fetch_instances()
    timeout = httpx.Timeout(settings.RELAY_RESOLVE_TIMEOUT)

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        for instance in piped[:_MAX_ATTEMPTS_PER_SERVICE]:
            url = await _try_piped(client, instance, track_id)
            if url:
                log.info("relay.piped_hit", track_id=track_id, instance=instance)
                _breaker_open_until = 0.0
                return url
        for instance in invidious[:_MAX_ATTEMPTS_PER_SERVICE]:
            url = await _try_invidious(client, instance, track_id)
            if url:
                log.info("relay.invidious_hit", track_id=track_id, instance=instance)
                _breaker_open_until = 0.0
                return url

    # Nothing answered. Open the breaker so the next cold tracks skip the
    # probe entirely instead of paying this sweep again.
    _breaker_open_until = now + _BREAKER_COOLDOWN
    log.info("relay.breaker_open", cooldown_s=_BREAKER_COOLDOWN)
    return None


async def _try_piped(client: httpx.AsyncClient, instance: str, track_id: str) -> Optional[str]:
    try:
        res = await client.get(
            f"{instance}/streams/{track_id}",
            headers={"User-Agent": _UA},
        )
        if res.status_code != 200:
            return None
        data = res.json()
        if data.get("error"):
            return None
        return _best_piped_audio(data.get("audioStreams") or [])
    except Exception as e:  # noqa: BLE001 — any instance failure means "next"
        log.debug("relay.piped_failed", instance=instance, error=str(e))
        return None


async def _try_invidious(
    client: httpx.AsyncClient, instance: str, track_id: str
) -> Optional[str]:
    try:
        res = await client.get(
            f"{instance}/api/v1/videos/{track_id}",
            headers={"User-Agent": _UA},
        )
        if res.status_code != 200:
            return None
        data = res.json()
        return _best_invidious_audio(
            data.get("adaptiveFormats") or [], instance, track_id
        )
    except Exception as e:  # noqa: BLE001
        log.debug("relay.invidious_failed", instance=instance, error=str(e))
        return None
