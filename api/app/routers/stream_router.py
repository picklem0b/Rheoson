from __future__ import annotations
import asyncio
import time
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


# ── Remote stream sessions ───────────────────────────────────
# Every remote (non-local) track gets ONE background yt-dlp "fill" task
# that writes the full audio to a buffer file. Clients never own the
# yt-dlp process: they stream from the buffer file as it grows, and the
# fill keeps running even if every client disconnects. When the fill
# finishes, the complete file is promoted to the durable remote cache
# and the session is dropped. This design fixes several correctness bugs
# that existed when the fill lived inside the first HTTP response:
#
#   - two simultaneous GETs for one track now share a single yt-dlp
#     process (previously each spawned its own, all writing the same
#     buffer file concurrently and corrupting it)
#   - a client disconnecting mid-stream can no longer kill the shared
#     fill NOR leave a truncated file promoted to the cache as "valid"
#   - byte-range (seek) requests against an in-progress stream wait for
#     the fill to complete instead of spawning a second download from
#     scratch
#   - the number of concurrent yt-dlp fills is bounded, so an attacker
#     (or a burst of distinct remote tracks) cannot spawn unbounded
#     subprocesses

_REMOTE_FILL_LIMIT = 6
_SESSION_IDLE_TTL  = 600.0   # finished sessions are swept after 10 min idle
_buffer_dir = Path("/tmp/Rheoson_stream_buffer")
_buffer_dir.mkdir(parents=True, exist_ok=True)

_remote_sessions: dict[str, dict] = {}  # track_id → {"task", "done", "ok", "accessed", "path"}
_session_lock = asyncio.Lock()


def _session_file(track_id: str) -> Path:
    return _buffer_dir / f"{track_id}.audio"


async def _fill_session(track_id: str, session: dict) -> None:
    """Background task: fill the buffer file, then flag the session done."""
    try:
        await _fill_buffer(track_id, session["path"])
        session["ok"] = True
        log.info("stream.session.filled", track_id=track_id)
    except asyncio.CancelledError:
        pass
    except Exception:
        session["ok"] = False
        try:
            if session["path"].exists():
                session["path"].unlink()
        except OSError:
            pass
    finally:
        session["done"].set()


def _drop_session_locked(track_id: str) -> None:
    session = _remote_sessions.pop(track_id, None)
    if session is None:
        return
    if session["ok"] and session["path"].exists():
        # Completed audio is worth keeping — move it into the durable cache
        # (TTL-managed) instead of deleting it.
        _remote_cache_set(track_id, session["path"])
    else:
        try:
            if session["path"].exists():
                session["path"].unlink()
        except OSError:
            pass


async def _sweep_sessions_locked() -> None:
    """Drop finished sessions that have been idle past _SESSION_IDLE_TTL."""
    now = time.monotonic()
    stale = [
        t for t, s in _remote_sessions.items()
        if s["done"].is_set() and now - s["accessed"] > _SESSION_IDLE_TTL
    ]
    for tid in stale:
        _drop_session_locked(tid)


async def _ensure_remote_session(track_id: str) -> dict | None:
    """Return the live session for `track_id`, starting the fill if missing.

    Returns None when the track is already durably cached — callers should
    then re-check the remote cache and serve from disk. Waits up to ~15s for
    a free fill slot when the concurrency limit is reached, then 503s.
    """
    for _ in range(150):
        async with _session_lock:
            await _sweep_sessions_locked()
            if _remote_cache_get(track_id) is not None:
                return None

            session = _remote_sessions.get(track_id)
            now = time.monotonic()
            if session is not None:
                session["accessed"] = now
                return session

            active = [s for s in _remote_sessions.values() if not s["done"].is_set()]
            if len(active) >= _REMOTE_FILL_LIMIT:
                pass  # fall through, release lock and retry after a beat
            else:
                session = {
                    "done":     asyncio.Event(),
                    "ok":       False,
                    "accessed": now,
                    "path":     _session_file(track_id),
                }
                session["task"] = asyncio.create_task(_fill_session(track_id, session))
                _remote_sessions[track_id] = session
                return session
        await asyncio.sleep(0.1)
    raise HTTPException(status_code=503, detail="Too many concurrent streams, try again shortly")


@router.post("/{track_id}/warm")
async def warm_stream(track_id: str, _user: dict = Depends(get_current_user)):
    """Start buffering a remote track in the background (idempotent).

    Uses the same single-fill-per-track session as the audio route, so a
    warm request and a concurrent play request share one yt-dlp process.
    """
    if len(track_id) != 11:
        raise HTTPException(status_code=404, detail="Invalid track ID")

    await _ensure_cache()
    if _find_local(track_id):
        return {"ok": True, "state": "local"}
    if _remote_cache_get(track_id):
        return {"ok": True, "state": "cached"}

    try:
        session = await _ensure_remote_session(track_id)
    except HTTPException:
        return {"ok": False, "state": "busy"}  # fill slots exhausted — play will retry
    if session is None:
        return {"ok": True, "state": "cached"}
    if session["done"].is_set():
        if session["ok"]:
            async with _session_lock:
                _drop_session_locked(track_id)
            return {"ok": True, "state": "cached"}
        return {"ok": False, "state": "failed"}
    return {"ok": True, "state": "warming"}


# ── Routes ────────────────────────────────────────────────────

@router.api_route("/{track_id}/audio", methods=["GET", "HEAD"], operation_id="stream_audio")
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

    # NOTE: no forced full-library rescan here. Previously every remote
    # GET set _cache_built=False and re-walked ALL music directories
    # (serialized under _cache_lock) before serving — a full filesystem
    # scan on every remote stream request, which turned into a hard
    # bottleneck as the library grew. New downloads already invalidate
    # the cache explicitly (invalidate_stream_cache) and the cron job
    # rescans periodically, so a per-request scan buys nothing.

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


# ── yt-dlp buffer fill ────────────────────────────────────────
# Downloads the full audio of a remote track to `dest`. Runs as the body
# of a background session task (see _ensure_remote_session) so it is
# decoupled from any single HTTP response.

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


# ── Remote live streaming (session-backed) ────────────────────
# A remote track is served straight from its growing buffer file. The
# yt-dlp fill runs as a background session task (see _ensure_remote_session)
# so it is owned by no single request and survives any client disconnecting.
# Completed buffers are promoted to the durable remote cache and served
# with full byte-range (seek) support.

async def _complete_session(track_id: str, session: dict) -> None:
    """Promote a finished buffer into the durable cache and drop the session."""
    async with _session_lock:
        if _remote_sessions.get(track_id) is session:
            _remote_sessions.pop(track_id, None)
    _remote_cache_set(track_id, session["path"])


async def _serve_session_stream(track_id: str, session: dict) -> Response:
    """Stream the growing buffer file until the fill task completes.

    Multiple concurrent readers can tail the same file; disconnecting one
    reader never touches the shared fill task.
    """
    path = session["path"]
    done = session["done"]

    def _size() -> int:
        try:
            return path.stat().st_size if path.exists() else 0
        except OSError:
            return 0

    async def _gen():
        pos   = 0
        total = 0
        try:
            # Follow the file while the background fill is writing it
            while not done.is_set():
                size = _size()
                if size > pos:
                    with open(path, "rb") as f:
                        f.seek(pos)
                        chunk = f.read(min(CHUNK, size - pos))
                    if chunk:
                        pos += len(chunk)
                        total += len(chunk)
                        yield chunk
                        continue
                await asyncio.sleep(0.05)

            # Fill finished — drain whatever remains and end cleanly
            while True:
                size = _size()
                if size <= pos:
                    break
                with open(path, "rb") as f:
                    f.seek(pos)
                    chunk = f.read(min(CHUNK, size - pos))
                if not chunk:
                    break
                pos += len(chunk)
                total += len(chunk)
                yield chunk

            if total == 0:
                # Fill produced nothing (failed) — surface an error so the
                # client retries through the normal path.
                raise HTTPException(status_code=502, detail="Stream warm-up failed")

            if session["ok"] and path.exists() and path.stat().st_size > 0:
                await _complete_session(track_id, session)
        except (GeneratorExit, ConnectionResetError, BrokenPipeError):
            # Client went away — the fill task keeps running in the background
            return

    return StreamingResponse(
        _gen(),
        media_type="audio/mpeg",
        headers={
            "Accept-Ranges":          "bytes",
            "Cache-Control":          "no-cache",
            "X-Content-Type-Options": "nosniff",
        },
    )


async def _serve_ytdlp(track_id: str, request: Request) -> Response:
    """Serve a remote track: from the durable cache, or live from its session.

    Strategy:
      1. Durable cache hit (a previous fill completed) → serve from disk.
      2. Otherwise get-or-create the per-track fill session (single yt-dlp
         shared by every concurrent listener) and stream the buffer file as
         it grows. First bytes typically arrive within a second or two of
         yt-dlp starting to produce output.
      3. Byte-range (seek) requests during an in-progress fill wait for the
         fill to complete (up to 120 s), then serve the exact range — instead
         of the old behaviour of spawning a second, conflicting download.
    """
    now = time.monotonic()
    if track_id in _failure_cache:
        if _failure_cache[track_id] > now:
            raise HTTPException(
                status_code=502,
                detail="Track temporarily unavailable (recent failure cached).",
            )
        del _failure_cache[track_id]

    # ── Case 1: durable cache hit ──────────────────────────────
    cached = _remote_cache_get(track_id)
    if cached is not None and cached.exists():
        log.debug("stream.remote_cache.hit", track_id=track_id)
        return _serve_local(cached, request)

    # ── Case 2: get-or-create the fill session ────────────────
    session = await _ensure_remote_session(track_id)
    if session is None:
        cached = _remote_cache_get(track_id)
        if cached is not None and cached.exists():
            return _serve_local(cached, request)
        raise HTTPException(status_code=502, detail="Track not available")

    if session["done"].is_set():
        # Fill finished while we were waiting for a slot
        if (
            session["ok"]
            and session["path"].exists()
            and session["path"].stat().st_size > 0
        ):
            await _complete_session(track_id, session)
            return _serve_local(session["path"], request)
        # The fill failed — fail fast and remember the failure so a retry
        # storm is not spawned. Requests after the TTL may try again.
        async with _session_lock:
            _remote_sessions.pop(track_id, None)
        _failure_cache[track_id] = time.monotonic() + _FAILURE_TTL
        raise HTTPException(
            status_code=502,
            detail="Could not stream this track. YouTube may be rate-limiting.",
        )

    # ── Case 3: fill in progress ──────────────────────────────
    # Byte-range requests need the complete file → wait for the fill.
    if request.headers.get("range"):
        try:
            await asyncio.wait_for(asyncio.shield(session["task"]), timeout=120.0)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            pass
        if (
            session["done"].is_set()
            and session["ok"]
            and session["path"].exists()
            and session["path"].stat().st_size > 0
        ):
            await _complete_session(track_id, session)
            return _serve_local(session["path"], request)
        async with _session_lock:
            _remote_sessions.pop(track_id, None)
        _failure_cache[track_id] = time.monotonic() + _FAILURE_TTL
        raise HTTPException(status_code=502, detail="Stream not ready for seeking yet")

    log.info("stream.ytdlp.live_stream", track_id=track_id)
    return await _serve_session_stream(track_id, session)


# ── Periodic cleanup ──────────────────────────────────────────

async def cleanup_expired_buffers() -> None:
    """Sweep finished sessions that have been idle too long.

    Completed audio is promoted to the durable (TTL-managed) remote cache
    instead of being deleted; failed/empty sessions drop their temp file.
    Called from the library-scan cron job.
    """
    async with _session_lock:
        await _sweep_sessions_locked()
