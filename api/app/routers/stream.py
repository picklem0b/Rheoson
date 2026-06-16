from __future__ import annotations
import asyncio
import structlog
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse, Response
from app.core.config import settings
from app.services.artwork_service import extract_artwork
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
CHUNK = 65_536  # 64 KB

# ── Local file cache ──────────────────────────────────────────
# Maps track_id → absolute Path.
# _cache_lock prevents two concurrent requests both seeing _cache_built=False
# and running _build_cache() simultaneously — which caused the
# "stream.cache.built count=0" appearing 2-3 times in the logs.

_local_cache: dict[str, Path] = {}
_cache_built  = False
_cache_lock   = asyncio.Lock()


def _build_cache_sync() -> None:
    """Sync build — called from inside the async lock."""
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
    """Build cache exactly once. Lock prevents concurrent rebuilds."""
    global _cache_built
    if _cache_built:
        return
    async with _cache_lock:
        # Double-check inside lock — another coroutine may have built it
        # while we were waiting for the lock
        if _cache_built:
            return
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _build_cache_sync)


def _find_local(track_id: str) -> Optional[Path]:
    """
    Synchronous cache lookup — only call after _ensure_cache() has run.
    Returns path if found and still exists, None otherwise.
    """
    if track_id in _local_cache:
        p = _local_cache[track_id]
        if p.exists():
            return p
        # Stale entry — file was deleted
        del _local_cache[track_id]
    return None


def invalidate_stream_cache() -> None:
    """Call after a download completes so the new file is found immediately."""
    global _cache_built
    _cache_built = False
    log.debug("stream.cache.invalidated")


# ── Routes ────────────────────────────────────────────────────

@router.api_route("/{track_id}/audio", methods=["GET", "HEAD"])
async def stream_audio(track_id: str, request: Request):
    await _ensure_cache()
    local = _find_local(track_id)

    if local:
        log.debug("stream.local", track_id=track_id, path=str(local))
        return _serve_local(local, request)

    if request.method == "HEAD":
        # Can't verify without downloading — return optimistic headers
        if len(track_id) != 11:
            raise HTTPException(status_code=404, detail="Invalid track ID")
        return Response(headers={
            "Accept-Ranges": "bytes",
            "Content-Type":  "audio/mpeg",
        })

    # Cache miss on GET — try rebuilding once in case a download just finished
    if not _find_local(track_id):
        global _cache_built
        _cache_built = False
        await _ensure_cache()
        local = _find_local(track_id)
        if local:
            return _serve_local(local, request)

    return await _serve_ytdlp(track_id, request)


@router.get("/{track_id}/artwork")
async def get_artwork(track_id: str):
    await _ensure_cache()
    local = _find_local(track_id)
    if not local:
        raise HTTPException(status_code=404, detail="Not downloaded locally")
    art = extract_artwork(local)
    return art if art else Response(status_code=204)


# ── Local file serving with range support ─────────────────────

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
    """
    Pipe audio from yt-dlp stdout → browser in real time.
    First bytes arrive in ~2-3 s. Uses mweb client to reduce rate-limiting.
    """
    yt_url = f"https://www.youtube.com/watch?v={track_id}"

    cmd = [
        "yt-dlp",
        "--quiet", "--no-warnings", "--no-playlist",
        "-x", "--audio-format", "mp3", "--audio-quality", "192K",
        "--extractor-args", "youtube:player_client=mweb,android,web",
        "--add-header", (
            "User-Agent:Mozilla/5.0 (Linux; Android 13; Pixel 7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Mobile Safari/537.36"
        ),
        "-o", "-",
        yt_url,
    ]

    log.info("stream.ytdlp.start", track_id=track_id)

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except Exception as e:
        log.error("stream.ytdlp.spawn.failed", error=str(e))
        raise HTTPException(status_code=502, detail="Stream process failed to start")

    first_chunk = await proc.stdout.read(CHUNK)
    if not first_chunk:
        stderr = await proc.stderr.read(2048)
        log.error("stream.ytdlp.no_output",
                  track_id=track_id,
                  stderr=stderr.decode(errors="ignore"))
        try:
            proc.kill()
        except Exception:
            pass
        raise HTTPException(
            status_code=502,
            detail="Could not stream this track. YouTube may be rate-limiting.",
        )

    log.info("stream.ytdlp.first_chunk", track_id=track_id, bytes=len(first_chunk))

    async def _pipe():
        yield first_chunk
        try:
            while True:
                if await request.is_disconnected():
                    log.info("stream.client.disconnected", track_id=track_id)
                    break
                chunk = await proc.stdout.read(CHUNK)
                if not chunk:
                    break
                yield chunk
        except asyncio.CancelledError:
            pass
        finally:
            try:
                proc.kill()
            except Exception:
                pass
            await proc.wait()
            log.info("stream.ytdlp.done", track_id=track_id)

    return StreamingResponse(
        _pipe(),
        media_type="audio/mpeg",
        headers={
            "Accept-Ranges":          "bytes",
            "Cache-Control":          "no-cache",
            "X-Content-Type-Options": "nosniff",
        },
    )