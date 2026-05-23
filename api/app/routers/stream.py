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

AUDIO_EXTS = ("mp3", "flac", "m4a", "ogg", "opus", "wav")
MIME_MAP   = {
    ".mp3":  "audio/mpeg",
    ".flac": "audio/flac",
    ".m4a":  "audio/mp4",
    ".ogg":  "audio/ogg",
    ".opus": "audio/ogg; codecs=opus",
    ".wav":  "audio/wav",
}


def _find_local(track_id: str) -> Path | None:
    """Find a local file by its MD5-based ID."""
    music_dir = Path(settings.MUSIC_DIR)
    if not music_dir.exists():
        return None
    for path in music_dir.rglob("*"):
        if path.suffix.lstrip(".") in AUDIO_EXTS:
            if _file_id(path) == track_id:
                return path
    return None


@router.get("/{track_id}/audio")
async def stream_audio(track_id: str, request: Request):
    """
    Stream audio for a track.
    - If the track is downloaded locally → serve with range support
    - Otherwise → pipe from yt-dlp in real time
    """
    # ── Local file ────────────────────────────────────────────
    local = _find_local(track_id)
    if local:
        return _range_response(local, request)

    # ── yt-dlp live stream ────────────────────────────────────
    return await _ytdlp_stream(track_id, request)


@router.get("/{track_id}/artwork")
async def get_artwork(track_id: str):
    """Extract embedded artwork from a local file."""
    local = _find_local(track_id)
    if not local:
        raise HTTPException(status_code=404, detail="Track not found locally")
    art = extract_artwork(local)
    if art:
        return art
    return Response(status_code=204)


# ── Local file streaming with range support ───────────────────

def _range_response(path: Path, request: Request) -> StreamingResponse | Response:
    suffix    = path.suffix.lower()
    mime      = MIME_MAP.get(suffix, "audio/mpeg")
    file_size = path.stat().st_size

    range_header = request.headers.get("range")

    if not range_header:
        # Full file
        def iterfile():
            with open(path, "rb") as f:
                while chunk := f.read(65536):
                    yield chunk
        return StreamingResponse(
            iterfile(),
            media_type=mime,
            headers={
                "Accept-Ranges":  "bytes",
                "Content-Length": str(file_size),
            },
        )

    # Parse range header — "bytes=start-end"
    try:
        range_val  = range_header.replace("bytes=", "")
        start, end = range_val.split("-")
        start      = int(start)
        end        = int(end) if end else file_size - 1
        end        = min(end, file_size - 1)
        length     = end - start + 1
    except Exception:
        raise HTTPException(status_code=416, detail="Invalid range")

    def iter_range():
        with open(path, "rb") as f:
            f.seek(start)
            remaining = length
            while remaining > 0:
                chunk = f.read(min(65536, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    return StreamingResponse(
        iter_range(),
        status_code=206,
        media_type=mime,
        headers={
            "Content-Range":  f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges":  "bytes",
            "Content-Length": str(length),
        },
    )


# ── yt-dlp live pipe stream ───────────────────────────────────

async def _ytdlp_stream(track_id: str, request: Request) -> StreamingResponse:
    """
    Pipe audio directly from yt-dlp without downloading.
    Uses best audio format, converts to mp3 on the fly via ffmpeg pipe.
    """
    import yt_dlp

    url = f"https://www.youtube.com/watch?v={track_id}"

    # Get the direct audio URL from yt-dlp (no download)
    loop = asyncio.get_event_loop()

    def _get_url():
        ydl_opts = {
            "format":        "bestaudio[ext=m4a]/bestaudio/best",
            "quiet":         True,
            "no_warnings":   True,
            "skip_download": True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if not info:
                return None
            # For playlists, take first entry
            if info.get("_type") == "playlist":
                entries = info.get("entries", [])
                info    = entries[0] if entries else None
            if not info:
                return None
            return info.get("url"), info.get("ext", "m4a")

    try:
        result = await loop.run_in_executor(None, _get_url)
    except Exception as e:
        log.error("stream.ytdlp.extract.failed", track_id=track_id, error=str(e))
        raise HTTPException(status_code=502, detail=f"Could not extract stream: {e}")

    if not result or not result[0]:
        raise HTTPException(status_code=404, detail="Stream URL not found")

    direct_url, ext = result
    mime = MIME_MAP.get(f".{ext}", "audio/mp4")

    # Proxy the stream from the CDN URL
    import httpx

    async def proxy():
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream("GET", direct_url) as r:
                async for chunk in r.aiter_bytes(65536):
                    if await request.is_disconnected():
                        break
                    yield chunk

    return StreamingResponse(
        proxy(),
        media_type=mime,
        headers={"Accept-Ranges": "bytes"},
    )