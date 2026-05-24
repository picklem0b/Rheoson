from __future__ import annotations
import asyncio
import structlog
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse, Response
from app.core.config import settings
from app.services.artwork_service import extract_artwork
from app.services.metadata_service import _file_id

log = structlog.get_logger()
router = APIRouter()

AUDIO_EXTS = {"mp3", "flac", "m4a", "ogg", "opus", "wav"}
MIME_MAP = {
    ".mp3":  "audio/mpeg",
    ".flac": "audio/flac",
    ".m4a":  "audio/mp4",
    ".ogg":  "audio/ogg",
    ".opus": "audio/ogg; codecs=opus",
    ".wav":  "audio/wav",
}

# Chunk size: 512KB — large enough to avoid constant requests, small enough to start fast
CHUNK_SIZE = 524_288


def _find_local(track_id: str) -> Path | None:
    """Find a downloaded local file by its MD5 ID."""
    for music_dir in settings.all_music_dirs:
        d = Path(music_dir)
        if not d.exists():
            continue
        for path in d.rglob("*"):
            if path.suffix.lstrip(".") in AUDIO_EXTS:
                if _file_id(path) == track_id:
                    return path
    return None


@router.get("/{track_id}/audio")
async def stream_audio(track_id: str, request: Request):
    """
    Stream audio for a track.
    Priority:
      1. Local downloaded file (range-supported)
      2. Live yt-dlp stream (proxied from YouTube CDN)
    """
    local = _find_local(track_id)
    if local:
        return _serve_local(local, request)

    return await _serve_ytdlp(track_id, request)


@router.get("/{track_id}/artwork")
async def get_artwork(track_id: str):
    """Return embedded artwork from a local file."""
    local = _find_local(track_id)
    if not local:
        raise HTTPException(status_code=404, detail="Track not downloaded locally")
    art = extract_artwork(local)
    if art:
        return art
    return Response(status_code=204)


# ── Local file: full range support ────────────────────────────

def _serve_local(path: Path, request: Request) -> Response:
    suffix    = path.suffix.lower()
    mime      = MIME_MAP.get(suffix, "audio/mpeg")
    file_size = path.stat().st_size
    range_hdr = request.headers.get("range")

    if not range_hdr:
        # No range — stream the full file
        def _full():
            with open(path, "rb") as f:
                while True:
                    chunk = f.read(CHUNK_SIZE)
                    if not chunk:
                        break
                    yield chunk

        return StreamingResponse(
            _full(),
            media_type=mime,
            headers={
                "Accept-Ranges":  "bytes",
                "Content-Length": str(file_size),
                "Cache-Control":  "no-cache",
            },
        )

    # Parse "bytes=start-end"
    try:
        raw        = range_hdr.replace("bytes=", "").strip()
        s, e       = raw.split("-")
        start      = int(s)
        end        = int(e) if e else file_size - 1
        end        = min(end, file_size - 1)
        chunk_len  = end - start + 1
    except Exception:
        raise HTTPException(status_code=416, detail="Invalid Range header")

    def _range():
        with open(path, "rb") as f:
            f.seek(start)
            remaining = chunk_len
            while remaining > 0:
                data = f.read(min(CHUNK_SIZE, remaining))
                if not data:
                    break
                remaining -= len(data)
                yield data

    return StreamingResponse(
        _range(),
        status_code=206,
        media_type=mime,
        headers={
            "Content-Range":  f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges":  "bytes",
            "Content-Length": str(chunk_len),
            "Cache-Control":  "no-cache",
        },
    )


# ── yt-dlp live stream ────────────────────────────────────────

async def _serve_ytdlp(track_id: str, request: Request) -> StreamingResponse:
    """
    Extract the direct CDN audio URL via yt-dlp (no download),
    then proxy it to the browser. Howler.js html5=true handles
    the streaming natively — no buffering issues.
    """
    import yt_dlp
    import httpx

    yt_url = f"https://www.youtube.com/watch?v={track_id}"
    loop   = asyncio.get_event_loop()

    def _extract():
        opts = {
            "format":        "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best",
            "quiet":         True,
            "no_warnings":   True,
            "skip_download": True,
            # Cookies help avoid bot detection on Termux
            "extractor_args": {"youtube": {"skip": ["hls", "dash"]}},
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(yt_url, download=False)
            if not info:
                return None, None
            if info.get("_type") == "playlist":
                entries = info.get("entries") or []
                info    = entries[0] if entries else None
            if not info:
                return None, None

            # Prefer a format with a direct URL
            fmts = info.get("formats") or []
            # Pick best audio-only format
            audio_fmts = [
                f for f in fmts
                if f.get("url") and f.get("vcodec") == "none"
            ]
            if audio_fmts:
                best = max(audio_fmts, key=lambda f: f.get("abr") or 0)
                return best["url"], best.get("ext", "m4a")

            # Fallback to top-level URL
            return info.get("url"), info.get("ext", "m4a")

    try:
        direct_url, ext = await loop.run_in_executor(None, _extract)
    except Exception as e:
        log.error("stream.extract.failed", track_id=track_id, error=str(e))
        raise HTTPException(status_code=502, detail=f"Stream extraction failed: {e}")

    if not direct_url:
        raise HTTPException(status_code=404, detail=f"No stream found for: {track_id}")

    mime = MIME_MAP.get(f".{ext}", "audio/mp4")

    # Forward any Range header the browser sends
    forward_headers: dict = {}
    if "range" in request.headers:
        forward_headers["Range"] = request.headers["range"]

    async def _proxy():
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(10.0, read=None),
                follow_redirects=True,
            ) as client:
                async with client.stream(
                    "GET",
                    direct_url,
                    headers=forward_headers,
                ) as resp:
                    async for chunk in resp.aiter_bytes(CHUNK_SIZE):
                        if await request.is_disconnected():
                            break
                        yield chunk
        except asyncio.CancelledError:
            return
        except Exception as e:
            log.warning("stream.proxy.error", track_id=track_id, error=str(e))
            return

    # If client sent Range, respond 206
    status = 206 if "range" in request.headers else 200

    return StreamingResponse(
        _proxy(),
        status_code=status,
        media_type=mime,
        headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-cache",
        },
    )