from __future__ import annotations
import asyncio
import tempfile
import time
import httpx
import structlog
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, Request, Query
from fastapi.responses import StreamingResponse, Response
from app.core.config import settings
from app.services.artwork_service import extract_artwork, fetch_remote_artwork
from app.services.metadata_service import _file_id

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
CHUNK = 65_536

# ── Local file cache ──────────────────────────────────────────

_local_cache: dict[str, Path] = {}
_cache_built  = False
_cache_lock   = asyncio.Lock()


def _build_cache_sync() -> None:
    global _cache_built
    _local_cache.clear()
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

    # Fall back to proxying the remote URL
    if not url:
        return Response(status_code=204)

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
async def clear_stream_cache():
    """Clear the in-memory stream file index — forces a rescan on next request."""
    invalidate_stream_cache()
    return {"ok": True, "message": "Stream cache cleared"}


@router.post("/remote-cache/clear")
async def clear_remote_cache():
    """Clear the in-memory remote stream cache (cached yt-dlp audio files)."""
    _remote_cache_clear()
    return {"ok": True, "message": "Remote stream cache cleared"}


@router.post("/artwork/cache/clear")
async def clear_artwork_cache():
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


# ── Local file serving ────────────────────────────────────────

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

    try:
        s, e  = rng.replace("bytes=", "").split("-")
        start = int(s)
        end   = int(e) if e else file_size - 1
        end   = min(end, file_size - 1)
        clen  = end - start + 1
    except Exception:
        raise HTTPException(status_code=416, detail="Bad Range header")

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


# ── yt-dlp pipe ───────────────────────────────────────────────

async def _serve_ytdlp(track_id: str, request: Request) -> StreamingResponse:
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
    base_cmd = [
        "yt-dlp", "--quiet", "--no-warnings", "--no-playlist",
        "-x", "--audio-format", "mp3", "--audio-quality", "192K", "-o", "-",
    ]

    last_stderr = None

    for attempt in range(3):
        extractor_args = extractor_args_variants[min(attempt, len(extractor_args_variants) - 1)]
        ua  = user_agents[attempt % len(user_agents)]
        cmd = [
            *base_cmd,
            "--extractor-args", extractor_args,
            "--add-header", f"User-Agent:{ua}",
            yt_url,
        ]

        log.info("stream.ytdlp.attempt", track_id=track_id, attempt=attempt + 1)

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except Exception as e:
            last_stderr = str(e).encode()
            await asyncio.sleep(0.8 + attempt)
            continue

        first_chunk = await proc.stdout.read(CHUNK)
        if not first_chunk:
            try:
                stderr = await proc.stderr.read(4096)
            except Exception:
                stderr = b""
            last_stderr = stderr
            log.warning("stream.ytdlp.no_output", track_id=track_id, attempt=attempt + 1)
            try:
                proc.kill()
            except Exception:
                pass
            await asyncio.sleep(0.8 + attempt * 0.5)
            continue

        # Build a temp file path for caching this stream
        cache_path = Path(tempfile.gettempdir()) / f"shulker_stream_{track_id}.mp3"
        cache_file = None

        # Start writing to temp file in background while streaming to client.
        # This way the first play streams live AND populates the cache.
        try:
            cache_file = open(cache_path, "wb")
            cache_file.write(first_chunk)
        except Exception:
            cache_file = None

        async def _pipe():
            yield first_chunk
            try:
                while True:
                    if await request.is_disconnected():
                        break
                    chunk = await proc.stdout.read(CHUNK)
                    if not chunk:
                        break
                    # Also write to cache file for future requests
                    if cache_file and not cache_file.closed:
                        try:
                            cache_file.write(chunk)
                        except Exception:
                            pass
                    yield chunk
            except asyncio.CancelledError:
                pass
            finally:
                try:
                    proc.kill()
                except Exception:
                    pass
                await proc.wait()
                # Close cache file and register in remote cache
                if cache_file and not cache_file.closed:
                    try:
                        cache_file.close()
                        if cache_path.exists() and cache_path.stat().st_size > 0:
                            _remote_cache_set(track_id, cache_path)
                    except Exception:
                        pass

        return StreamingResponse(
            _pipe(),
            media_type="audio/mpeg",
            headers={
                "Accept-Ranges":          "bytes",
                "Cache-Control":          "no-cache",
                "X-Content-Type-Options": "nosniff",
            },
        )

    raise HTTPException(
        status_code=502,
        detail="Could not stream this track. YouTube may be rate-limiting. Try again or download the track instead.",
    )
