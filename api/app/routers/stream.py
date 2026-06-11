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
# Built lazily on first request, rebuilt on cache miss (file may have appeared).
# A full rglob on every stream request was the primary audio stutter cause.

_local_cache: dict[str, Path] = {}
_cache_built  = False


def _build_cache() -> None:
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


def _find_local(track_id: str) -> Optional[Path]:
    """Return cached path or None. Rebuilds cache once on miss."""
    global _cache_built

    if not _cache_built:
        _build_cache()

    if track_id in _local_cache:
        p = _local_cache[track_id]
        if p.exists():
            return p
        # File was deleted — remove stale entry and fall through
        del _local_cache[track_id]

    # Cache miss — maybe a new download just landed; do one targeted rebuild
    _build_cache()
    return _local_cache.get(track_id)


def invalidate_stream_cache() -> None:
    """Call this after a download completes so the new file is found immediately."""
    global _cache_built
    _cache_built = False
    log.debug("stream.cache.invalidated")


# ── Routes ────────────────────────────────────────────────────

@router.api_route("/{track_id}/audio", methods=["GET", "HEAD"])
async def stream_audio(track_id: str, request: Request):
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

    return await _serve_ytdlp(track_id, request)


@router.get("/{track_id}/artwork")
async def get_artwork(track_id: str):
    local = _find_local(track_id)
    if not local:
        raise HTTPException(status_code=404, detail="Not downloaded locally")
    art = extract_artwork(local)
    return art if art else Response(status_code=204)


# ── Local file streaming with range support ───────────────────

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
        raise HTTPException(status_code=416, detail="Bad Range")

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
    Pipe audio directly from yt-dlp stdout → browser with no temp file.
    First audio bytes arrive in ~2-3 s.
    Uses mweb client which is least rate-limited on mobile IPs.
    """
    yt_url = f"https://www.youtube.com/watch?v={track_id}"

    cmd = [
        "yt-dlp",
        "--quiet",
        "--no-warnings",
        "--no-playlist",
        "-x",
        "--audio-format",   "mp3",
        "--audio-quality",  "192K",
        "--extractor-args", "youtube:player_client=mweb,android,web",
        "--add-header",     "User-Agent:Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
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

    # Read first chunk — confirms yt-dlp is producing output
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