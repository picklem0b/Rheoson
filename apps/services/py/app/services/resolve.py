"""Streaming source resolution — the engine's half of the relay contract.

Answer one question: *where do the bytes come from?* The answer is almost
always YouTube's own CDN, asked politely with ``yt-dlp -g``. Installing a
track and re-encoding it buffers the whole song through a post-processor
before a single byte reaches the player; asking for the resolved URL costs one
metadata extraction and zero bytes, and the CDN is byte-range capable, so the
player starts on the first frames.

Everything here is transport-level and framework-free: URL resolution, mime
inference and a best-effort probe. The HTTP surface lives in ``app.main``.
Ported from the current stack's ``app/services/stream_service.py`` — the client
ladder, the failure markers and the outcome of measuring them are unchanged.
"""

from __future__ import annotations

import asyncio
import subprocess
import time
from typing import Optional
from urllib.parse import parse_qs, unquote, urlparse

import httpx
import structlog

from app.core import toolchain
from app.core import settings as engine_settings

log = structlog.get_logger()

#: Audio-only in a natively decodable container first (smallest transfer,
#: nothing to mux); a muxed `best` last, because it costs video bytes on the
#: wire but still yields correct audio once the extractor strips it.
FORMAT_SELECTOR = "bestaudio[ext=m4a]/bestaudio[ext=mp4]/bestaudio/best[ext=mp4]/best"

#: Client order. `default` is first deliberately: it is YouTube's own mix and
#: still exposes the audio-only DASH formats the mobile clients have been
#: dropping. `android` and `android_vr` follow because they avoid the JS
#: challenge entirely, so they keep working on hosts (and datacentre IPs)
#: where the web challenge is refused.
#:
#: `ios`, `mweb` and `web` were removed after being measured against two
#: tracks: all three failed every attempt with "Requested format is not
#: available" (6/6), because those clients now answer with SABR / PO-token
#: gated formats that no `-f` selector can pick. Keeping them cost three
#: subprocess spawns plus a full extraction each on every failure path while
#: never producing a format. A client that can serve a track the others cannot
#: can be re-added with evidence.
DEFAULT_CLIENT_LADDER: tuple[str, ...] = (
    "default",
    "android",
    "android_vr",
    "tv_embedded",
)

#: Playback mime per preferred container, used when a client's answer has to
#: be described before any bytes have been read.
PREFERRED_AUDIO_MIME = "audio/mp4"

#: Extractor-level failures. Matching one means "ask a different client".
#: Deliberately excludes transport errors (timeouts, DNS, disk) — burning the
#: whole ladder on those only makes a failure slower to surface.
_EXTRACTOR_FAILURE_MARKERS = (
    "requested format is not available",
    "sign in to confirm",
    "confirm you're not a bot",
    "the page needs to be reloaded",
    "unable to extract",
    "no video formats found",
    "failed to extract",
    "nsig extraction failed",
    "unable to download webpage",
    "http error 403",
    "this video is not available",
    "content is not available",
)

#: The extractor succeeded and handed back a URL, but the media server refused
#: the bytes: a signature that expired or is bound to the IP it was minted for,
#: or an edge rate-limit. Switching player client cannot help — extraction
#: already worked — while re-running mints a fresh URL, so this is retried on
#: the *same* client. Measured on a track failing with "unable to download
#: video data: HTTP Error 403": 5/5 success on immediate re-run.
_TRANSIENT_MEDIA_REFUSAL_MARKERS = (
    "unable to download video data",
    "http error 403",
    "http error 429",
    "http error 503",
)

UA_ANDROID = (
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
)
UA_DESKTOP = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

_MIME_BY_CONTENT_TYPE = {
    "audio/mp4": "audio/mp4",
    "video/mp4": "audio/mp4",
    "audio/aac": "audio/mp4",
    "audio/webm": "audio/webm",
    "video/webm": "audio/webm",
    "audio/mpeg": "audio/mpeg",
    "audio/mp3": "audio/mpeg",
    "audio/ogg": "audio/ogg; codecs=opus",
}

_BARE_TRACK_ID_ALLOWED = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_")


def is_extractor_failure(text: str) -> bool:
    """True when switching player client is worth trying."""
    low = (text or "").lower()
    return any(marker in low for marker in _EXTRACTOR_FAILURE_MARKERS)


def is_transient_media_refusal(text: str) -> bool:
    """True when the bytes were refused after a successful extraction.

    Overlaps :func:`is_extractor_failure` on purpose (``http error 403`` is in
    both), so callers must decide which one to consult first: retrying the same
    client, or switching to another one.
    """
    low = (text or "").lower()
    return any(marker in low for marker in _TRANSIENT_MEDIA_REFUSAL_MARKERS)


def is_valid_track_id(track_id: str) -> bool:
    """True for a bare YouTube video id.

    An id reaches this service from a URL query parameter and is passed to a
    subprocess; anything outside the id alphabet — separators, spaces, a full
    URL, a shell metacharacter — is refused before it can become an argument.
    """
    if not track_id or len(track_id) > 64:
        return False
    return all(ch in _BARE_TRACK_ID_ALLOWED for ch in track_id)


def client_attempts(ladder: Optional[list[str]] = None) -> list[list[str]]:
    """``--extractor-args`` payloads to try, in order (empty list = default)."""
    order = ladder or list(DEFAULT_CLIENT_LADDER)
    return [[] if client == "default" else [f"youtube:player_client={client}"] for client in order]


# ── Direct URL cache ──────────────────────────────────────────

_direct_url_cache: dict[str, tuple[str, float]] = {}


def cached_direct_url(track_id: str, ttl: float) -> Optional[str]:
    """Return a still-valid resolved CDN URL, or None."""
    entry = _direct_url_cache.get(track_id)
    if entry is None:
        return None
    url, ts = entry
    if time.time() - ts > ttl:
        _direct_url_cache.pop(track_id, None)
        return None
    return url


def forget_direct_url(track_id: str) -> None:
    """Drop a cached URL — used when the CDN rejects it as expired."""
    _direct_url_cache.pop(track_id, None)


def clear_direct_url_cache() -> None:
    _direct_url_cache.clear()


def _first_url(stdout: bytes) -> Optional[str]:
    """yt-dlp prints one URL per line; only absolute ones are usable."""
    for line in (stdout or b"").decode("utf-8", "replace").splitlines():
        line = line.strip()
        if line.startswith("http"):
            return line
    return None


def _last_error_line(stderr: bytes) -> str:
    lines = (stderr or b"").decode("utf-8", "replace").strip().splitlines()
    return lines[-1].strip() if lines else ""


def resolve_direct_url_sync(
    track_id: str,
    *,
    timeout: Optional[float] = None,
    ladder: Optional[list[str]] = None,
    use_cache: bool = True,
    ttl: Optional[float] = None,
) -> Optional[str]:
    """Blocking ``yt-dlp -g`` resolution, for callers already in a thread.

    Kept separate from the async wrapper so background work (the doctor, the
    download service) can reuse it without pulling in an event loop. The cache
    lives here rather than in the wrapper so *every* caller benefits from it —
    resolution costs a subprocess, and a replay must not pay for it again.

    Cache note: a synchronous caller cannot refresh a URL the CDN has already
    rejected; pass ``use_cache=False`` to force a fresh extraction when a
    cached URL fails mid-stream.
    """
    cfg = engine_settings.load()
    if use_cache:
        fresh_enough = cached_direct_url(track_id, ttl if ttl is not None else cfg.direct_url_ttl)
        if fresh_enough:
            return fresh_enough

    limit = timeout or cfg.resolve_timeout
    yt_url = f"https://www.youtube.com/watch?v={track_id}"

    for extractor_args in client_attempts(ladder or (cfg.ladder or None)):
        cmd = [
            toolchain.ytdlp_bin(), "--quiet", "--no-warnings", "--no-playlist",
            "-f", FORMAT_SELECTOR, "-g",
        ]
        for arg in extractor_args:
            cmd += ["--extractor-args", arg]
        cmd += ["--add-header", f"User-Agent:{UA_DESKTOP}", yt_url]

        try:
            proc = subprocess.run(cmd, capture_output=True, timeout=limit, check=False)
        except Exception as e:  # noqa: BLE001 — any failure means "try next"
            log.warning("stream.resolve.spawn_failed", track_id=track_id, error=str(e))
            continue

        url = _first_url(proc.stdout)
        if url:
            _direct_url_cache[track_id] = (url, time.time())
            return url

        last = _last_error_line(proc.stderr)
        if last and not is_extractor_failure(last):
            # Not a client problem (network, disk) — the rest of the ladder
            # would only waste a subprocess each.
            log.warning("stream.resolve.transport_error", track_id=track_id, error=last[:200])
            break
        if last:
            log.info("stream.resolve.client_rejected", track_id=track_id, error=last[:160])

    return None


async def resolve_direct_url(track_id: str, **kwargs) -> Optional[str]:
    """Async wrapper: run the blocking extraction off the event loop.

    Returns None when every player-client variant fails, in which case the
    caller falls back to its own byte path.
    """
    return await asyncio.to_thread(resolve_direct_url_sync, track_id, **kwargs)


# ── Mime inference ────────────────────────────────────────────


def mime_from_response(url: str, content_type: str) -> str:
    """Best-guess audio mime from the CDN URL, then the response header."""
    try:
        qs = parse_qs(urlparse(url).query)
        declared = unquote((qs.get("mime") or [""])[0]).lower()
        if "mp4" in declared:
            return "audio/mp4"
        if "webm" in declared:
            return "audio/webm"
        if "mpeg" in declared:
            return "audio/mpeg"
    except Exception:  # noqa: BLE001 — a malformed URL is not fatal
        pass
    return _MIME_BY_CONTENT_TYPE.get(content_type, "audio/mpeg")


def parse_content_range(header: Optional[str]) -> tuple[Optional[int], Optional[int], Optional[int]]:
    """Parse ``Content-Range: bytes 0-12345/12346`` → (start, end, total)."""
    if not header:
        return (None, None, None)
    try:
        spec = header.split(" ", 1)[1]
        rng, _, total = spec.partition("/")
        start_s, _, end_s = rng.partition("-")
        return (
            int(start_s),
            int(end_s),
            int(total) if total not in ("", "*") else None,
        )
    except (ValueError, IndexError):
        return (None, None, None)


async def probe_direct(track_id: str, *, timeout: float = 10.0) -> Optional[dict]:
    """Ask the CDN about a track: real content type and length, no bytes.

    Used by the server's HEAD branch and the Doctor so the answer matches what
    a GET would deliver instead of an optimistic guess. Best-effort: any
    failure is None, never an exception.
    """
    # yt-dlp is synchronous; keep the event loop free while it works.
    url = await asyncio.to_thread(resolve_direct_url_sync, track_id)
    if not url:
        return None

    client = httpx.AsyncClient(timeout=httpx.Timeout(timeout), follow_redirects=True)
    try:
        res = await client.head(url, headers={"User-Agent": UA_DESKTOP})
        if res.status_code >= 400:
            # Some CDN edges reject HEAD; a one-byte ranged GET is the fallback.
            res = await client.get(url, headers={"User-Agent": UA_DESKTOP, "Range": "bytes=0-0"})
    except Exception as e:  # noqa: BLE001 — probing is best-effort
        log.debug("stream.probe.failed", track_id=track_id, error=str(e))
        return None
    finally:
        await client.aclose()

    content_type = (res.headers.get("content-type") or "").split(";")[0].strip().lower()
    length = res.headers.get("content-length")
    ranges = parse_content_range(res.headers.get("content-range"))
    return {
        "url": url,
        "mime": mime_from_response(url, content_type),
        "bytes": ranges[2] or (int(length) if length and length.isdigit() else None),
    }
