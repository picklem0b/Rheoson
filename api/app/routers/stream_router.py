from __future__ import annotations
import asyncio
import tempfile
import time
import httpx
import os
import structlog
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import StreamingResponse, Response
from app.core.config import settings
from app.core.deps import get_current_user
from app.services.artwork_service import extract_artwork, fetch_remote_artwork
from app.services.metadata_service import _file_id

# NOTE on auth for byte routes: the four content routes below (audio,
# artwork, artwork-proxy) must stay reachable by <audio>/<img> elements,
# which cannot attach Authorization headers. They are read-only byte
# streams for a specific, validated resource id — either an instance
# library file or an 11-char YouTube id — and are intentionally treated as
# instance-shared content. Every mutating/stateful endpoint in this router
# (warm, cache clears) requires a verified session.

log    = structlog.get_logger()
router = APIRouter()

AUDIO_EXTS = {"mp3", "flac", "m4a", "ogg", "opus", "wav"}
MIME_MAP   = {
    ".mp3":  "audio/mpeg",
    ".flac": "audio/flac",
    ".m4a":  "audio/mp4",
    ".ogg":  "audio/ogg",
    ".opus": "audio/ogg; codecs=opus",
    ".wav":  "audio/wav",
}

# ── Artwork proxy allowlist ──────────────────────────────────
# Only known image CDNs used by YouTube Music / Spotify artwork may be
# fetched through the proxy. Anything else (arbitrary http/https URLs)
# is refused — otherwise the endpoint is an open SSRF relay into the
# server's network (cloud metadata, internal services).
_ARTWORK_ALLOWED_HOSTS = {
    "i.ytimg.com",
    "yt3.ggpht.com",
    "yt3.googleusercontent.com",
    "lh3.googleusercontent.com",
    "lh5.googleusercontent.com",
    "lirp.cdn-website.com",
    "i.scdn.co",   # Spotify CDN
    "mosaic.scdn.co",
    "image-cdn-ak.spotifycdn.com",
    "image-cdn-fa.spotifycdn.com",
    "seed-mix-image.spotifycdn.com",
    "charts-images.scdn.co",
}

def _artwork_url_allowed(url: str) -> bool:
    """Allow only https image URLs from the known CDN hosts."""
    try:
        from urllib.parse import urlparse
        parts = urlparse(url)
    except Exception:
        return False
    if parts.scheme != "https" or not parts.hostname:
        return False
    host = parts.hostname.lower()
    if host in _ARTWORK_ALLOWED_HOSTS:
        return True
    return any(host.endswith("." + d) for d in _ARTWORK_ALLOWED_HOSTS)
# BUG #23: Make chunk size configurable (default 64KB)
CHUNK = int(os.environ.get("STREAM_CHUNK_SIZE", "65536"))

# BUG #7: Failure cache — avoid retry storms for tracks that consistently 502
_failure_cache: dict[str, float] = {}  # track_id -> expiry timestamp
_FAILURE_TTL = 60.0  # seconds
_FAILURE_MAX = 200

# ── Local file cache ──────────────────────────────────────────

_local_cache: dict[str, Path] = {}
_cache_built  = False
_cache_lock   = asyncio.Lock()


def _build_cache_sync() -> None:
    global _cache_built
    _local_cache.clear()
    # BUG FIX: Scan ALL configured music dirs, not just MUSIC_DIR
    for d in settings.all_music_dirs:
        base = Path(d)
        if not base.exists():
            continue
        for p in base.rglob("*"):
            if p.suffix.lstrip(".") in AUDIO_EXTS:
                try:
                    _local_cache[_file_id(p)] = p
                except Exception:
                    pass
    _cache_built = True
    log.info("stream.cache.built", count=len(_local_cache))


async def _ensure_cache() -> None:
    global _cache_built
    if _cache_built:
        return
    async with _cache_lock:
        if _cache_built:
            return
        # BUG #1: Clear stale entries inside the lock before rebuilding
        # to prevent race condition where concurrent requests each see
        # _cache_built=False and all rebuild simultaneously.
        _local_cache.clear()
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _build_cache_sync)


def _find_local(track_id: str) -> Optional[Path]:
    if track_id in _local_cache:
        p = _local_cache[track_id]
        if p.exists():
            return p
        del _local_cache[track_id]
    return None


def invalidate_stream_cache() -> None:
    global _cache_built
    # BUG #14: Also clear _local_cache so deleted files don't persist
    _local_cache.clear()
    _cache_built = False
    log.debug("stream.cache.invalidated")


# ── Remote stream cache ───────────────────────────────────────
# When a non-local track is streamed via yt-dlp, the audio bytes are
# written to a temp file in the background. Subsequent requests for
# the same track_id serve from that temp file instantly — no new
# yt-dlp process, no re-resolving the YouTube URL.
#
# Cache policy:
#   - Max entries: 30 tracks (most recent, LRU eviction)
#   - TTL: 30 minutes per entry (stale entries are evicted on access)
#   - Temp files live in system temp dir and are cleaned on eviction

_REMOTE_CACHE_MAX = 30
_REMOTE_CACHE_TTL = 30 * 60  # 30 minutes in seconds

_remote_cache: dict[str, dict] = {}  # track_id → {"path": Path, "ts": float}


def _remote_cache_get(track_id: str) -> Optional[Path]:
    """Return cached path if it exists and hasn't expired."""
    entry = _remote_cache.get(track_id)
    if entry is None:
        return None
    if time.time() - entry["ts"] > _REMOTE_CACHE_TTL:
        # Expired — evict
        _remote_cache_evict(track_id)
        return None
    if not entry["path"].exists():
        _remote_cache_evict(track_id)
        return None
    return entry["path"]


def _remote_cache_set(track_id: str, path: Path) -> None:
    """Add or update a cached entry. Evict oldest if over capacity."""
    # Evict expired entries first
    _remote_cache_prune()
    # Evict oldest if at capacity
    while len(_remote_cache) >= _REMOTE_CACHE_MAX:
        oldest_id = min(_remote_cache, key=lambda k: _remote_cache[k]["ts"])
        _remote_cache_evict(oldest_id)
    _remote_cache[track_id] = {"path": path, "ts": time.time()}
    log.debug("stream.remote_cache.set", track_id=track_id, cache_size=len(_remote_cache))


def _remote_cache_evict(track_id: str) -> None:
    entry = _remote_cache.pop(track_id, None)
    if entry and entry["path"].exists():
        try:
            entry["path"].unlink()
        except OSError:
            pass


def _remote_cache_prune() -> None:
    """Remove all expired entries."""
    now = time.time()
    expired = [k for k, v in _remote_cache.items() if now - v["ts"] > _REMOTE_CACHE_TTL]
    for k in expired:
        _remote_cache_evict(k)


def _remote_cache_clear() -> None:
    """Clear all cached remote streams."""
    for track_id in list(_remote_cache):
        _remote_cache_evict(track_id)
    log.info("stream.remote_cache.cleared")


# ── Artwork cache ─────────────────────────────────────────────
# In-memory cache for proxied remote artwork.
# Keyed by track_id so each track's art is fetched once per process lifetime.
# Max 500 entries — LRU-style eviction (pop oldest when full).

_artwork_cache: dict[str, bytes] = {}
_ARTWORK_MAX   = 500


def _artwork_cache_set(key: str, data: bytes) -> None:
    if len(_artwork_cache) >= _ARTWORK_MAX:
        oldest = next(iter(_artwork_cache))
        del _artwork_cache[oldest]
    _artwork_cache[key] = data


# ── Background warm-up ────────────────────────────────────────
# The frontend fires POST /stream/{id}/warm the moment a track is
# selected (or appears in the next-up queue). We spawn yt-dlp in the
# background and buffer the audio to disk, so by the time the user
# actually presses play the GET /audio below serves from the buffer
# file — first bytes in well under a second instead of waiting for
# yt-dlp extraction on the play request itself.

_warm_tasks: dict[str, asyncio.Task] = {}
_warm_lock   = asyncio.Lock()
_WARM_LIMIT  = 6  # max concurrent background yt-dlp processes


def _warm_finished(track_id: str) -> None:
    _warm_tasks.pop(track_id, None)


async def _warm_track(track_id: str) -> None:
    """Download a remote track's audio to the buffer dir in the background."""
    try:
        await _ensure_cache()
        if _find_local(track_id):
            return
        if _remote_cache_get(track_id):
            return
        buf_path = _buffer_dir / f"{track_id}.audio"
        if buf_path.exists() and buf_path.stat().st_size > 0:
            _remote_cache_set(track_id, buf_path)
            return
        await _fill_buffer(track_id, buf_path)
        if buf_path.exists() and buf_path.stat().st_size > 0:
            _remote_cache_set(track_id, buf_path)
            log.info("stream.warm.complete", track_id=track_id)
    except Exception:
        log.warning("stream.warm.failed", track_id=track_id, exc_info=True)


@router.post("/{track_id}/warm")
async def warm_stream(track_id: str, _user: dict = Depends(get_current_user)):
    """Start buffering a remote track in the background.

    Idempotent: dedupes against the remote cache and any warm already
    in flight. Bounded by _WARM_LIMIT concurrent downloads — when the
    limit is reached the request is a cheap no-op ("busy") and the next
    GET falls back to the live-stream path.
    """
    if len(track_id) != 11:
        raise HTTPException(status_code=404, detail="Invalid track ID")

    # Local/downloaded tracks need no warming — instant either way
    await _ensure_cache()
    if _find_local(track_id):
        return {"ok": True, "state": "local"}
    if _remote_cache_get(track_id):
        return {"ok": True, "state": "cached"}

    async with _warm_lock:
        existing = _warm_tasks.get(track_id)
        if existing and not existing.done():
            return {"ok": True, "state": "warming"}
        # Drop finished tasks so their slots free up
        for tid in [t for t, task in _warm_tasks.items() if task.done()]:
            _warm_tasks.pop(tid, None)
        if len(_warm_tasks) >= _WARM_LIMIT:
            return {"ok": False, "state": "busy"}

        task = asyncio.create_task(_warm_track(track_id))
        _warm_tasks[track_id] = task
        task.add_done_callback(lambda _t, tid=track_id: _warm_finished(tid))
        return {"ok": True, "state": "warming"}


# ── Routes ────────────────────────────────────────────────────

@router.api_route("/{track_id}/audio", methods=["GET", "HEAD"])
async def stream_audio(track_id: str, request: Request):
    await _ensure_cache()
    local = _find_local(track_id)

    if local:
        log.debug("stream.local", track_id=track_id, path=str(local))
        return _serve_local(local, request)

    if request.method == "HEAD":
        if len(track_id) != 11:
            raise HTTPException(status_code=404, detail="Invalid track ID")
        return Response(headers={
            "Accept-Ranges": "bytes",
            "Content-Type":  "audio/mpeg",
        })

    if not _find_local(track_id):
        global _cache_built
        _cache_built = False
        await _ensure_cache()
        local = _find_local(track_id)
        if local:
            return _serve_local(local, request)

    # Check the remote stream cache — serves cached audio instantly
    # if the track was streamed within the last 30 minutes.
    cached = _remote_cache_get(track_id)
    if cached:
        log.debug("stream.remote_cache.hit", track_id=track_id)
        return _serve_local(cached, request)

    # Not a local file and not cached — this would spawn yt-dlp against a
    # YouTube URL. Fail fast on malformed remote ids instead of burning a
    # yt-dlp process (and a 30 s spawn timeout) for garbage input.
    if len(track_id) != 11:
        raise HTTPException(status_code=404, detail="Track not found locally and id is not a valid remote track")

    return await _serve_ytdlp(track_id, request)


@router.get("/{track_id}/artwork")
async def get_artwork(track_id: str):
    """
    Serve embedded artwork from a locally downloaded file.
    Returns 204 if the file exists but has no embedded art.
    Returns 404 if the track is not downloaded.
    """
    await _ensure_cache()
    local = _find_local(track_id)
    if not local:
        raise HTTPException(status_code=404, detail="Not downloaded locally")
    art = extract_artwork(local)
    return art if art else Response(status_code=204)


@router.get("/{track_id}/artwork-proxy")
async def proxy_artwork(
    track_id: str,
    url:      str = Query(..., description="Remote artwork URL to proxy"),
):
    """
    Proxy a remote artwork URL (ytmusicapi thumbnail) through the API server.

    Why this endpoint exists:
      - The APK WebView sometimes can't fetch i.ytimg.com / lh3.googleusercontent.com
        directly due to network restrictions or CORS on Android WebViews.
      - Render's free tier IPs can hit rate limits on Google's image CDN.
      - By proxying through the API, we get server-side caching and the
        frontend only ever talks to our own domain.

    The frontend should call this as:
      /api/stream/{videoId}/artwork-proxy?url={encodeURIComponent(artworkUrl)}
    """
    # Return cached bytes if available
    if track_id in _artwork_cache:
        cached = _artwork_cache[track_id]
        mime = _detect_image_mime(cached)
        return Response(
            content=cached,
            media_type=mime,
            headers={
                "Cache-Control": "public, max-age=86400",
                "X-Cache":       "HIT",
            },
        )

    # First try the local file's embedded art (downloaded track)
    await _ensure_cache()
    local = _find_local(track_id)
    if local:
        art = extract_artwork(local)
        if art:
            _artwork_cache_set(track_id, art.body)
            art.headers["Cache-Control"] = "public, max-age=86400"
            return art

    # Fall back to proxying the remote URL — only known artwork CDNs allowed.
    if not url:
        return Response(status_code=204)
    if not _artwork_url_allowed(url):
        raise HTTPException(status_code=400, detail="Artwork URL not allowed")

    data = await fetch_remote_artwork(url)
    if not data:
        return Response(status_code=204)

    _artwork_cache_set(track_id, data)
    mime = _detect_image_mime(data)
    return Response(
        content=data,
        media_type=mime,
        headers={
            "Cache-Control": "public, max-age=86400",
            "X-Cache":       "MISS",
        },
    )


@router.post("/cache/clear")
async def clear_stream_cache(_user: dict = Depends(get_current_user)):
    """Clear the in-memory stream file index — forces a rescan on next request."""
    invalidate_stream_cache()
    return {"ok": True, "message": "Stream cache cleared"}


@router.post("/remote-cache/clear")
async def clear_remote_cache(_user: dict = Depends(get_current_user)):
    """Clear the in-memory remote stream cache (cached yt-dlp audio files)."""
    _remote_cache_clear()
    return {"ok": True, "message": "Remote stream cache cleared"}


@router.post("/artwork/cache/clear")
async def clear_artwork_cache(_user: dict = Depends(get_current_user)):
    """Clear the in-memory artwork proxy cache."""
    _artwork_cache.clear()
    return {"ok": True, "message": "Artwork cache cleared", "cleared": len(_artwork_cache)}


# ── Helpers ───────────────────────────────────────────────────

def _detect_image_mime(data: bytes) -> str:
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return "image/jpeg"


# ── Serving from an in-progress background warm ───────────────
# Reads the buffer file as the warm task appends to it. No Range
# support here (the final size is unknown until the download ends) —
# range requests against a warming track wait for completion above.

def _serve_warming_file(track_id: str, warm: asyncio.Task) -> StreamingResponse:
    buf_path = _buffer_dir / f"{track_id}.audio"

    def _size() -> int:
        try:
            return buf_path.stat().st_size if buf_path.exists() else 0
        except OSError:
            return 0

    async def _gen():
        pos   = 0
        total = 0
        try:
            # Follow the file while the warm download is writing it
            while not warm.done():
                size = _size()
                if size > pos:
                    with open(buf_path, "rb") as f:
                        f.seek(pos)
                        chunk = f.read(min(CHUNK, size - pos))
                    if chunk:
                        pos += len(chunk)
                        total += len(chunk)
                        yield chunk
                        continue
                await asyncio.sleep(0.05)

            # Warm finished — drain whatever remains and end cleanly
            while True:
                size = _size()
                if size <= pos:
                    break
                with open(buf_path, "rb") as f:
                    f.seek(pos)
                    chunk = f.read(min(CHUNK, size - pos))
                if not chunk:
                    break
                pos += len(chunk)
                total += len(chunk)
                yield chunk

            if total == 0:
                # Warm produced nothing (failed or cancelled) — surface an
                # error so the client retries through the normal live path.
                raise HTTPException(
                    status_code=502,
                    detail="Stream warm-up failed",
                )
        except (GeneratorExit, ConnectionResetError, BrokenPipeError):
            # Client went away — let the warm task keep filling the cache
            return

    return StreamingResponse(
        _gen(),
        media_type="audio/mpeg",
        headers={
            "Accept-Ranges":         "bytes",
            "Cache-Control":         "no-cache",
            "X-Content-Type-Options": "nosniff",
        },
    )


# ── Local file serving ────────────────────────────────────────

def _parse_range(rng: str, file_size: int) -> tuple[int, int]:
    """Parse an HTTP Range header into inclusive (start, end).

    Supports `bytes=START-END`, `bytes=START-` and suffix `bytes=-N`.
    Raises HTTPException(416) for malformed or unsatisfiable ranges.
    """
    try:
        spec = rng.split("=", 1)[1].strip() if "=" in rng else rng.strip()
        if "," in spec:
            # Multi-range requests are not supported — take the first only
            spec = spec.split(",")[0].strip()
        if not spec:
            raise ValueError("empty")
        s, e = spec.split("-", 1)
        if e and int(e) < 0:
            raise ValueError("negative end")
        if s == "":
            # Suffix range: last N bytes
            n = int(e)
            if n <= 0:
                raise ValueError("bad suffix")
            if n >= file_size:
                return (0, file_size - 1)
            return (file_size - n, file_size - 1)
        start = int(s)
        end   = int(e) if e else file_size - 1
    except Exception:
        raise HTTPException(status_code=416, detail="Bad Range header")
    if start >= file_size or start > end:
        raise HTTPException(status_code=416, detail="Range not satisfiable")
    end = min(end, file_size - 1)
    return (start, end)


def _serve_local(path: Path, request: Request) -> Response:
    mime      = MIME_MAP.get(path.suffix.lower(), "audio/mpeg")
    file_size = path.stat().st_size
    rng       = request.headers.get("range")

    if request.method == "HEAD":
        return Response(status_code=200, headers={
            "Accept-Ranges":  "bytes",
            "Content-Length": str(file_size),
            "Content-Type":   mime,
        })

    if not rng:
        def _full():
            with open(path, "rb") as f:
                while chunk := f.read(CHUNK):
                    yield chunk
        return StreamingResponse(_full(), media_type=mime, headers={
            "Accept-Ranges":  "bytes",
            "Content-Length": str(file_size),
            "Cache-Control":  "no-cache",
        })

    start, end = _parse_range(rng, file_size)
    clen = end - start + 1

    def _range():
        with open(path, "rb") as f:
            f.seek(start)
            rem = clen
            while rem > 0:
                data = f.read(min(CHUNK, rem))
                if not data:
                    break
                rem -= len(data)
                yield data

    return StreamingResponse(_range(), status_code=206, media_type=mime, headers={
        "Content-Range":  f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges":  "bytes",
        "Content-Length": str(clen),
        "Cache-Control":  "no-cache",
    })


# ── yt-dlp buffered streaming ─────────────────────────────────
# Remote YouTube tracks are buffered to a temp file so that:
#   1. Range requests work (seeking within the stream).
#   2. Multiple clients can share one yt-dlp process.
#   3. The stream can resume after a brief disconnect.
# Buffer is kept for 10 minutes after last access, then cleaned up.

_remote_buffer: dict[str, dict] = {}  # track_id -> {"path": Path, "size": int, "accessed": float}
_buffer_lock = asyncio.Lock()
_BUFFER_TTL = 600.0  # 10 minutes
_BUFFER_MAX = 20     # max simultaneous buffered streams
_buffer_dir = Path("/tmp/Rheoson_stream_buffer")
_buffer_dir.mkdir(parents=True, exist_ok=True)


async def _get_or_create_buffer(track_id: str, request: Request) -> dict:
    """Return a buffer dict {path, size, accessed} for this track.

    If already buffered, return it. Otherwise spawn yt-dlp to fill the buffer,
    then return it. Raises HTTPException on failure.
    """
    async with _buffer_lock:
        # Check existing buffer
        if track_id in _remote_buffer:
            buf = _remote_buffer[track_id]
            if buf["path"].exists():
                buf["accessed"] = time.monotonic()
                buf["size"] = buf["path"].stat().st_size
                return buf
            else:
                del _remote_buffer[track_id]

        # Evict oldest if at capacity
        if len(_remote_buffer) >= _BUFFER_MAX:
            oldest_key = min(_remote_buffer, key=lambda k: _remote_buffer[k]["accessed"])
            _evict_buffer(oldest_key)

    # Fill the buffer — this can take a few seconds for the first request.
    # We hold no lock during the yt-dlp spawn (it's slow I/O).
    buf_path = _buffer_dir / f"{track_id}.audio"
    await _fill_buffer(track_id, buf_path)

    buf = {"path": buf_path, "size": buf_path.stat().st_size, "accessed": time.monotonic()}
    async with _buffer_lock:
        _remote_buffer[track_id] = buf
    return buf


def _evict_buffer(track_id: str) -> None:
    buf = _remote_buffer.pop(track_id, None)
    if buf and buf["path"].exists():
        try:
            buf["path"].unlink()
        except Exception:
            pass


async def _fill_buffer(track_id: str, dest: Path) -> None:
    """Spawn yt-dlp and write the full audio stream to dest."""
    yt_url = f"https://www.youtube.com/watch?v={track_id}"

    extractor_args_variants = [
        "youtube:player_client=mweb,android,web",
        "youtube:player_client=web",
        "youtube:player_client=android",
    ]
    user_agents = [
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ]
    audio_fmt  = settings.AUDIO_FORMAT or "mp3"
    audio_qual = "0" if settings.AUDIO_QUALITY == "best" else (settings.AUDIO_QUALITY or "192")
    base_cmd = [
        "yt-dlp", "--quiet", "--no-warnings", "--no-playlist",
        "-x", "--audio-format", audio_fmt, "--audio-quality", f"{audio_qual}K",
        "-o", "-",
    ]

    last_error = None

    for attempt in range(3):
        extractor_args = extractor_args_variants[min(attempt, len(extractor_args_variants) - 1)]
        ua = user_agents[attempt % len(user_agents)]
        cmd = [*base_cmd, "--extractor-args", extractor_args, "--add-header", f"User-Agent:{ua}", yt_url]

        log.info("stream.ytdlp.fill_buffer", track_id=track_id, attempt=attempt + 1)

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
        except Exception as e:
            last_error = str(e)
            await asyncio.sleep(0.8 + attempt)
            continue

        # Spawn timeout — wait for first bytes from yt-dlp
        try:
            first_chunk = await asyncio.wait_for(proc.stdout.read(CHUNK), timeout=30.0)
        except asyncio.TimeoutError:
            log.warning("stream.buffer.spawn_timeout", track_id=track_id)
            try:
                proc.kill()
            except Exception:
                pass
            await asyncio.sleep(0.8 + attempt * 0.5)
            continue

        if not first_chunk:
            last_error = "yt-dlp produced no output"
            try:
                proc.kill()
            except Exception:
                pass
            try:
                await asyncio.wait_for(proc.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                pass
            await asyncio.sleep(0.8 + attempt * 0.5)
            continue

        # BUG FIX: Write first_chunk to dest and stream the rest.
        # Previously first_chunk was read but never written, so the
        # buffer file was always empty and _fill_buffer always raised 502.
        try:
            with open(dest, "wb") as f:
                f.write(first_chunk)
                # Stream remaining stdout to disk
                while True:
                    chunk = await proc.stdout.read(CHUNK)
                    if not chunk:
                        break
                    f.write(chunk)
            await proc.wait()
            log.info("stream.buffer.filled", track_id=track_id, size=dest.stat().st_size)
            return
        except Exception as e:
            last_error = str(e)
            log.warning("stream.buffer.write_error", track_id=track_id, error=str(e))
            if dest.exists():
                dest.unlink()
            try:
                proc.kill()
            except Exception:
                pass
            await asyncio.sleep(0.8 + attempt * 0.5)
            continue

    # All attempts failed
    if dest.exists():
        dest.unlink()
    raise HTTPException(
        status_code=502,
        detail="Could not stream this track. YouTube may be rate-limiting.",
    )


# ── Live-stream from yt-dlp ───────────────────────────────────
# Yields audio chunks as they arrive from yt-dlp and simultaneously
# writes them to a temp file so the buffer is ready for the next
# request (range seeking, re-play, etc.).
# This is the key to fast startup: the client receives bytes within
# seconds instead of waiting for the full 10-30 s download.

def _ytdlp_cmd(track_id: str) -> list[str]:
    """Build the yt-dlp command for a given track ID."""
    yt_url = f"https://www.youtube.com/watch?v={track_id}"
    audio_fmt  = settings.AUDIO_FORMAT or "mp3"
    audio_qual = "0" if settings.AUDIO_QUALITY == "best" else (settings.AUDIO_QUALITY or "192")
    return [
        "yt-dlp", "--quiet", "--no-warnings", "--no-playlist",
        "-x", "--audio-format", audio_fmt, "--audio-quality", f"{audio_qual}K",
        "-o", "-",
        "--extractor-args", "youtube:player_client=mweb,android,web",
        "--add-header", "User-Agent:Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        yt_url,
    ]


async def _ytdlp_chunks(track_id: str):
    """Async generator: yield audio bytes from yt-dlp, caching to disk."""
    buf_path = _buffer_dir / f"{track_id}.audio"
    # Fallback UA variants for retry on failure
    user_agents = [
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ]
    extractor_variants = [
        "youtube:player_client=mweb,android,web",
        "youtube:player_client=web",
        "youtube:player_client=android",
    ]

    last_error: str | None = None

    for attempt in range(3):
        ea = extractor_variants[min(attempt, len(extractor_variants) - 1)]
        ua = user_agents[attempt % len(user_agents)]
        cmd = _ytdlp_cmd(track_id)
        # Override extractor-args and UA for this attempt
        cmd[cmd.index("--extractor-args") + 1] = ea
        cmd[cmd.index("--add-header") + 1] = f"User-Agent:{ua}"

        log.info("stream.ytdlp.spawn", track_id=track_id, attempt=attempt + 1)

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
        except Exception as e:
            last_error = str(e)
            await asyncio.sleep(0.8 + attempt)
            continue

        # Wait for first chunk with a timeout — proves yt-dlp is alive
        try:
            first = await asyncio.wait_for(proc.stdout.read(CHUNK), timeout=30.0)
        except asyncio.TimeoutError:
            log.warning("stream.ytdlp.spawn_timeout", track_id=track_id)
            try:
                proc.kill()
            except Exception:
                pass
            await asyncio.sleep(0.8 + attempt * 0.5)
            continue

        if not first:
            last_error = "yt-dlp produced no output"
            try:
                proc.kill()
            except Exception:
                pass
            try:
                await asyncio.wait_for(proc.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                pass
            await asyncio.sleep(0.8 + attempt * 0.5)
            continue

        # Success — stream first chunk, then the rest, while caching
        log.info("stream.ytdlp.first_chunk", track_id=track_id, size=len(first))
        try:
            with open(buf_path, "wb") as f:
                f.write(first)
                yield first
                while True:
                    chunk = await proc.stdout.read(CHUNK)
                    if not chunk:
                        break
                    f.write(chunk)
                    yield chunk
            await proc.wait()
            log.info("stream.ytdlp.stream_done", track_id=track_id, size=buf_path.stat().st_size)
            return  # success — stop retrying
        except (ConnectionResetError, BrokenPipeError, GeneratorExit):
            # Client disconnected mid-stream — stop yt-dlp, keep the partial cache
            log.info("stream.ytdlp.client_disconnect", track_id=track_id)
            try:
                proc.kill()
            except Exception:
                pass
            return
        except Exception as e:
            last_error = str(e)
            log.warning("stream.ytdlp.stream_error", track_id=track_id, error=str(e))
            if buf_path.exists():
                buf_path.unlink()
            try:
                proc.kill()
            except Exception:
                pass
            await asyncio.sleep(0.8 + attempt * 0.5)
            continue

    # All attempts exhausted
    if buf_path.exists():
        buf_path.unlink()
    _failure_cache[track_id] = time.monotonic() + _FAILURE_TTL
    raise HTTPException(
        status_code=502,
        detail="Could not stream this track. YouTube may be rate-limiting.",
    )


async def _serve_ytdlp(track_id: str, request: Request) -> Response:
    """Serve a remote track via yt-dlp.

    Strategy:
      1. If a cached buffer already exists → serve from disk (instant).
      2. If the buffer is currently being filled → wait for it.
      3. Otherwise → stream directly from yt-dlp to the client AND
         simultaneously write to the buffer file in the background.
         This means audio starts playing as soon as the first bytes
         arrive (typically 2-4 s) instead of waiting for the full
         download (10-30 s).
    """
    # Failure cache check
    now = time.monotonic()
    if track_id in _failure_cache:
        if _failure_cache[track_id] > now:
            raise HTTPException(
                status_code=502,
                detail="Track temporarily unavailable (recent failure cached).",
            )
        else:
            del _failure_cache[track_id]

    # ── Case 1: buffer already exists (cached from earlier request) ──
    cached = _remote_cache_get(track_id)
    if cached and cached.exists():
        log.debug("stream.remote_cache.hit", track_id=track_id)
        return _serve_local(cached, request)

    # ── Case 2: check the buffer dict (may be in-progress) ────────
    async with _buffer_lock:
        if track_id in _remote_buffer:
            buf = _remote_buffer[track_id]
            if buf["path"].exists() and buf["size"] > 0:
                file_size = buf["size"]
                rng = request.headers.get("range")
                if request.method == "HEAD":
                    return Response(headers={
                        "Accept-Ranges":  "bytes",
                        "Content-Length": str(file_size),
                        "Content-Type":   "audio/mpeg",
                    })
                if not rng:
                    def _full_cached():
                        with open(buf["path"], "rb") as f:
                            while chunk := f.read(CHUNK):
                                yield chunk
                    return StreamingResponse(_full_cached(), media_type="audio/mpeg", headers={
                        "Accept-Ranges":  "bytes",
                        "Content-Length": str(file_size),
                        "Cache-Control":  "no-cache",
                        "X-Content-Type-Options": "nosniff",
                    })
                # Range request on cached buffer
                start, end = _parse_range(rng, file_size)
                clen = end - start + 1
                def _range_cached():
                    with open(buf["path"], "rb") as f:
                        f.seek(start)
                        rem = clen
                        while rem > 0:
                            data = f.read(min(CHUNK, rem))
                            if not data:
                                break
                            rem -= len(data)
                            yield data
                return StreamingResponse(_range_cached(), status_code=206, media_type="audio/mpeg", headers={
                    "Content-Range":  f"bytes {start}-{end}/{file_size}",
                    "Accept-Ranges":  "bytes",
                    "Content-Length": str(clen),
                    "Cache-Control":  "no-cache",
                    "X-Content-Type-Options": "nosniff",
                })

    # ── Case 2.5: a background warm is already buffering this track ──
    # Join it instead of spawning a second yt-dlp process: serve straight
    # from the buffer file as it grows, so the first bytes reach the
    # client as soon as the warm download writes them (near-instant when
    # the warm started even a second or two before play).
    warm = _warm_tasks.get(track_id)
    if warm and not warm.done():
        if not request.headers.get("range"):
            return _serve_warming_file(track_id, warm)
        # Range requests need the complete file — wait for the warm to
        # finish, then serve the exact byte range from disk.
        try:
            await asyncio.wait_for(asyncio.shield(warm), timeout=120.0)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            pass
        cached = _remote_cache_get(track_id)
        if cached:
            return _serve_local(cached, request)

    # ── Case 3: no buffer — stream directly from yt-dlp ─────────
    # The generator below spawns yt-dlp, streams audio bytes directly to
    # the HTTP response, AND simultaneously writes them to a temp file.
    # After the stream completes the temp file becomes the cache for
    # subsequent requests (range requests, re-plays, etc.).

    buf_path = _buffer_dir / f"{track_id}.audio"
    log.info("stream.ytdlp.live_stream", track_id=track_id)

    async def _live_stream():
        """Stream yt-dlp output directly to the client while caching to disk."""
        total_bytes = 0
        try:
            async for chunk in _ytdlp_chunks(track_id):
                total_bytes += len(chunk)
                yield chunk
        except Exception as e:
            log.warning("stream.ytdlp.live_error", track_id=track_id, error=str(e))
            raise
        finally:
            # Register in remote cache so subsequent requests serve from disk
            if total_bytes > 0 and buf_path.exists():
                _remote_cache_set(track_id, buf_path)
                log.info("stream.ytdlp.cached", track_id=track_id, size=total_bytes)

    return StreamingResponse(
        _live_stream(),
        media_type="audio/mpeg",
        headers={
            "Accept-Ranges":         "bytes",
            "Cache-Control":         "no-cache",
            "X-Content-Type-Options": "nosniff",
        },
    )


# ── Periodic cleanup for expired remote buffers ────────────────

def cleanup_expired_buffers() -> None:
    """Remove buffers older than _BUFFER_TTL. Called from the cron job."""
    now = time.monotonic()
    expired = [k for k, v in _remote_buffer.items() if now - v["accessed"] > _BUFFER_TTL]
    for k in expired:
        _evict_buffer(k)
    if expired:
        log.info("stream.buffer.cleanup", evicted=len(expired))


# ── Cache the failure to avoid repeated retry storms ──────────
# (failure cache logic is now inside _serve_ytdlp above)
