"""Streaming source resolution.

This module answers one question: *where do the bytes for a remote track come
from, and how do we get them as fast as possible?*

The answer is almost always YouTube's own CDN. Asking yt-dlp to download a
track and re-encode it buffers the entire song through a post-processor before
a single byte reaches the player — on Termux that is the difference between
"press play and hear it" and a seven-to-thirty second wait. Asking yt-dlp for
the resolved CDN URL instead (`-g`) costs one metadata extraction and no
bytes, and the CDN is byte-range capable, so a player can start on the first
few kilobytes and seek wherever it likes. Streaming never transcodes; it
relays.

Everything here is transport-level and framework-free: URL resolution, mime
inference and a range-aware upstream reader. The HTTP route that glues it to
the app lives in ``app.routers.stream_router``.
"""

from __future__ import annotations

import asyncio
import os
import time
from pathlib import Path
from typing import AsyncIterator, Optional
from urllib.parse import parse_qs, unquote, urlparse

import httpx

import structlog

from app.core import toolchain

log = structlog.get_logger()

# ── Tunables ──────────────────────────────────────────────────

#: Chunk size used when reading from the CDN.
CHUNK = int(os.environ.get("STREAM_CHUNK_SIZE", "65536"))

# ── Client and format ladders ─────────────────────────────────
#
# YouTube answers with a different format set depending on which player
# client responds: the web clients want its JS challenge solved, the mobile
# ones dodge it but sometimes expose only muxed video, and any given client
# can start refusing a particular video outright. A single hard-coded client
# and format therefore breaks track by track — which is exactly how
# "Requested format is not available" and "Sign in to confirm you're not a
# bot" turn into one dead download.
#
# Trying the clients in order, against a selector permissive enough to accept
# whatever the answering client offers, is what keeps extraction working as
# YouTube changes underneath us.

#: Ordered most-desirable → most-permissive. Audio-only in a natively
#: decodable container first (smallest transfer, nothing to mux); a muxed
#: `best` is last, because it costs video bytes on the wire but still yields
#: correct audio once the extractor strips it.
FORMAT_SELECTOR = os.environ.get(
    "STREAM_YTDLP_FORMAT",
    "bestaudio[ext=m4a]/bestaudio[ext=mp4]/bestaudio/best[ext=mp4]/best",
)

#: Audio-only selector used when nothing may require a post-processor: the
#: download path on a host without ffmpeg, and streaming always. The download
#: ladder above ends in a muxed ``best``, which only yields audio after the
#: extractor runs it through ffmpeg — so without ffmpeg the download must stay
#: inside containers that hold audio on their own and are already valid
#: library extensions.
RAW_AUDIO_SELECTOR = os.environ.get(
    "STREAM_YTDLP_RAW_FORMAT",
    "bestaudio[ext=m4a]/bestaudio[ext=mp4]/bestaudio",
)

#: Client order. `default` is first deliberately: it is YouTube's own mix and
#: still exposes the audio-only DASH formats that the mobile clients have been
#: dropping. `android` and `android_vr` follow because they avoid the JS
#: challenge entirely, so they keep working on hosts (and datacentre IPs)
#: where the web challenge is refused.
#:
#: `ios`, `mweb` and `web` were removed after measuring them against two
#: tracks: all three failed every attempt with "Requested format is not
#: available" (6/6), because those clients now answer with SABR / PO-token
#: gated formats that no `-f` selector can pick. Keeping them cost three
#: subprocess spawns plus a full extraction each on every failure path while
#: never producing a format — pure latency added to the worst case. A client
#: that can serve a track the others cannot can be re-added with evidence.
CLIENT_LADDER: tuple[str, ...] = (
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


def is_extractor_failure(text: str) -> bool:
    """True when switching player client is worth trying."""
    low = (text or "").lower()
    return any(marker in low for marker in _EXTRACTOR_FAILURE_MARKERS)


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


def is_transient_media_refusal(text: str) -> bool:
    """True when the bytes were refused after a successful extraction.

    Overlaps ``is_extractor_failure`` on purpose (``http error 403`` is in
    both), so callers must decide which one to consult first: retrying the
    same client, or switching to another one.
    """
    low = (text or "").lower()
    return any(marker in low for marker in _TRANSIENT_MEDIA_REFUSAL_MARKERS)


def client_attempts() -> list[list[str]]:
    """`--extractor-args` payloads to try, in order (empty list = default)."""
    return [
        [] if client == "default" else [f"youtube:player_client={client}"]
        for client in CLIENT_LADDER
    ]

#: Resolved CDN URLs are signed for roughly six hours; refresh well inside
#: that window.
DIRECT_URL_TTL = 4 * 60 * 60

#: How long a single `yt-dlp -g` extraction may take before we give up on the
#: fast path and let the yt-dlp buffer fallback handle the track.
RESOLVE_TIMEOUT = 25.0

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

# ── Direct URL cache ──────────────────────────────────────────

_direct_url_cache: dict[str, tuple[str, float]] = {}


def cached_direct_url(track_id: str) -> Optional[str]:
    """Return a still-valid resolved CDN URL, or None."""
    entry = _direct_url_cache.get(track_id)
    if entry is None:
        return None
    url, ts = entry
    if time.time() - ts > DIRECT_URL_TTL:
        _direct_url_cache.pop(track_id, None)
        return None
    return url


def forget_direct_url(track_id: str) -> None:
    """Drop a cached URL — used when the CDN rejects it as expired."""
    _direct_url_cache.pop(track_id, None)


def clear_direct_url_cache() -> None:
    _direct_url_cache.clear()


def resolve_direct_url_sync(track_id: str) -> Optional[str]:
    """Blocking `yt-dlp -g` resolution, for callers already in a thread.

    Kept separate from the async wrapper so background tasks that run in an
    executor (the doctor, the download service) can reuse it without pulling
    in the event loop.
    """
    import subprocess

    yt_url = f"https://www.youtube.com/watch?v={track_id}"

    for extractor_args in client_attempts():
        cmd = [
            toolchain.ytdlp_bin(), "--quiet", "--no-warnings", "--no-playlist",
            "-f", FORMAT_SELECTOR, "-g",
        ]
        for arg in extractor_args:
            cmd += ["--extractor-args", arg]
        cmd += ["--add-header", f"User-Agent:{UA_DESKTOP}", yt_url]

        try:
            proc = subprocess.run(
                cmd, capture_output=True, timeout=RESOLVE_TIMEOUT, check=False
            )
        except Exception as e:  # noqa: BLE001 — any failure means "try next"
            log.warning("stream.resolve.spawn_failed", track_id=track_id, error=str(e))
            continue

        for line in (proc.stdout or b"").decode("utf-8", "replace").splitlines():
            line = line.strip()
            if line.startswith("http"):
                _direct_url_cache[track_id] = (line, time.time())
                return line

        stderr = (proc.stderr or b"").decode("utf-8", "replace").strip().splitlines()
        if stderr and not is_extractor_failure(stderr[-1]):
            # Not a client problem (network, disk) — the rest of the ladder
            # would only waste a subprocess each.
            log.warning(
                "stream.resolve.transport_error",
                track_id=track_id,
                error=stderr[-1][:200],
            )
            break

    return None


async def resolve_direct_url(track_id: str) -> Optional[str]:
    """Resolve a track's CDN URL with `yt-dlp -g`, downloading no bytes.

    Returns None when every player-client variant fails, in which case the
    caller falls back to the buffered yt-dlp path.
    """
    cached = cached_direct_url(track_id)
    if cached:
        return cached

    # yt-dlp is synchronous; keep the event loop free while it works.
    return await asyncio.to_thread(resolve_direct_url_sync, track_id)


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


# ── Range parsing ─────────────────────────────────────────────


def parse_range_start(header: Optional[str]) -> Optional[int]:
    """First byte offset of a `Range` header, or None when unparseable.

    Only the start offset matters to callers: a `bytes=0-` request is what
    every media element sends first and is *not* a seek, while any other
    offset is.
    """
    if not header:
        return None
    try:
        unit, _, spec = header.strip().partition("=")
        if unit.lower() != "bytes":
            return None
        start = spec.split(",")[0].split("-")[0].strip()
        return int(start) if start else 0
    except (ValueError, AttributeError):
        return None


def is_whole_file_range(header: Optional[str]) -> bool:
    """True for an open-ended `bytes=0-` request.

    This is the request every media element sends before it starts playing,
    and it is not a seek: it asks for "everything, from the beginning". A
    server that cannot yet answer with a full Content-Length can still start
    sending the file as it is produced — which is what makes playback begin
    on the first frames instead of on the last byte. Explicit bounded ranges
    (`bytes=0-9`, `bytes=1000-2000`) are left alone, because those carry a
    promise about exactly which bytes come back.
    """
    if not header:
        return False
    try:
        unit, _, spec = header.strip().partition("=")
        if unit.lower() != "bytes":
            return False
        first = spec.split(",")[0].strip()
        return first.endswith("-") and first[:-1].strip() == "0"
    except (ValueError, AttributeError):
        return False


def parse_content_range(header: Optional[str]) -> tuple[Optional[int], Optional[int], Optional[int]]:
    """Parse `Content-Range: bytes 0-12345/12346` → (start, end, total)."""
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


# ── Upstream access ───────────────────────────────────────────


class UpstreamError(RuntimeError):
    """The CDN could not be reached, or refused the request."""


class UpstreamStream:
    """An open CDN response, safe to iterate and always closed."""

    def __init__(
        self,
        client: httpx.AsyncClient,
        response: httpx.Response,
        mime: str,
    ) -> None:
        self._client = client
        self._response = response
        self.mime = mime
        self.status_code = response.status_code
        self.headers = response.headers

    @property
    def content_length(self) -> Optional[int]:
        raw = self._response.headers.get("content-length")
        try:
            return int(raw) if raw is not None else None
        except ValueError:
            return None

    @property
    def content_range(self) -> tuple[Optional[int], Optional[int], Optional[int]]:
        return parse_content_range(self._response.headers.get("content-range"))

    @property
    def covers_whole_file(self) -> bool:
        """True when this response carries the entire track.

        A plain 200 always does. A 206 does when it starts at 0 and ends at
        the last byte — which is exactly what the CDN returns for a media
        element's opening `bytes=0-` request, and therefore the common case.
        """
        if self.status_code == 200:
            return True
        start, end, total = self.content_range
        return total is not None and start == 0 and end == total - 1

    async def iter_bytes(self) -> AsyncIterator[bytes]:
        """Yield the response body. The caller owns `aclose()`."""
        async for chunk in self._response.aiter_bytes(CHUNK):
            if chunk:
                yield chunk

    async def aclose(self) -> None:
        """Release the response and its connection. Safe to call twice."""
        try:
            await self._response.aclose()
        except Exception:  # noqa: BLE001 — already gone
            pass
        try:
            await self._client.aclose()
        except Exception:  # noqa: BLE001 — already gone
            pass


async def open_upstream(
    url: str,
    range_header: Optional[str] = None,
    timeout: float = 30.0,
    read_timeout: float = 60.0,
) -> UpstreamStream:
    """Open the CDN response for `url`, forwarding the client's Range header.

    Forwarding the range is the whole point: a seek, or the opening
    `bytes=0-` request every media element sends, is then answered with the
    exact bytes asked for, with the CDN's own Content-Length and Content-Range
    intact — so the browser knows the track's duration and can start playing
    immediately instead of buffering against an open-ended stream.

    Raises `UpstreamError` when the CDN cannot be reached or refuses the
    request, so the caller can fall back to the transcoding path. The returned
    stream must be closed with `await stream.aclose()`.
    """
    headers = {"User-Agent": UA_DESKTOP, "Accept": "*/*"}
    if range_header:
        headers["Range"] = range_header

    client = httpx.AsyncClient(
        timeout=httpx.Timeout(timeout, read=read_timeout),
        follow_redirects=True,
    )
    try:
        response = await client.send(
            client.build_request("GET", url, headers=headers), stream=True
        )
    except Exception as e:  # noqa: BLE001 — surfaced to the caller as UpstreamError
        await client.aclose()
        raise UpstreamError(str(e)) from e

    if response.status_code not in (200, 206):
        await response.aclose()
        await client.aclose()
        raise UpstreamError(f"CDN returned {response.status_code}")

    content_type = (response.headers.get("content-type") or "").split(";")[0].strip().lower()
    return UpstreamStream(client, response, mime_from_response(url, content_type))


async def probe_direct(track_id: str) -> Optional[dict]:
    """HEAD the CDN for a track: real content type and length, no bytes.

    Used by the stream route's HEAD branch (and the doctor) so the answer
    matches what a GET would actually deliver instead of an optimistic guess.
    """
    url = await resolve_direct_url(track_id)
    if not url:
        return None

    client = httpx.AsyncClient(timeout=httpx.Timeout(10.0), follow_redirects=True)
    try:
        res = await client.head(url, headers={"User-Agent": UA_DESKTOP})
        if res.status_code >= 400:
            # Some CDN edges reject HEAD; a one-byte ranged GET is the fallback.
            res = await client.get(
                url, headers={"User-Agent": UA_DESKTOP, "Range": "bytes=0-0"}
            )
    except Exception as e:  # noqa: BLE001 — probing is best-effort
        log.debug("stream.probe.failed", track_id=track_id, error=str(e))
        return None
    finally:
        await client.aclose()

    content_type = (res.headers.get("content-type") or "").split(";")[0].strip().lower()
    length = res.headers.get("content-length")
    ranges = parse_content_range(res.headers.get("content-range"))
    return {
        "mime": mime_from_response(url, content_type),
        "bytes": ranges[2] or (int(length) if length and length.isdigit() else None),
    }


def buffer_path(track_id: str, suffix: str = "audio") -> Path:
    """Where a partial relay writes while it is still in flight."""
    return Path(os.environ.get("STREAM_BUFFER_DIR", "/tmp/Rheoson_stream_buffer")) / (
        f"{track_id}.{suffix}"
    )
