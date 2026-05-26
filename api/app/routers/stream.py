from __future__ import annotations
import asyncio
import structlog
from pathlib import Path
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
CHUNK = 65_536  # 64KB


def _find_local(track_id: str) -> Path | None:
    for d in settings.all_music_dirs:
        base = Path(d)
        if not base.exists():
            continue
        for p in base.rglob("*"):
            if p.suffix.lstrip(".") in AUDIO_EXTS and _file_id(p) == track_id:
                return p
    return None


@router.api_route("/{track_id}/audio", methods=["GET", "HEAD"])
async def stream_audio(track_id: str, request: Request):
    # Local downloaded file — fast path
    local = _find_local(track_id)
    if local:
        return _serve_local(local, request)

    # HEAD — just confirm it's a valid YouTube ID
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
        return Response(headers={
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


# ── yt-dlp direct pipe — no URL extraction step ───────────────
async def _serve_ytdlp(track_id: str, request: Request) -> StreamingResponse:
    """
    Pipe audio directly using yt-dlp's subprocess output.

    Key insight: instead of:
      1. yt-dlp extract URL  (blocks, often returns nothing on Termux)
      2. ffmpeg fetch URL    (second network round trip)

    We do:
      yt-dlp -x --audio-format mp3 -o - URL
      → yt-dlp handles extraction + download + conversion internally
      → Streams mp3 bytes directly to stdout
      → We pipe those bytes straight to the browser
      → First audio bytes arrive in ~2-3 seconds instead of 15+
    """
    yt_url = f"https://www.youtube.com/watch?v={track_id}"

    # yt-dlp command — pipe to stdout as mp3
    # Using mweb client which is least rate-limited on mobile IPs
    cmd = [
        "yt-dlp",
        "--quiet",
        "--no-warnings",
        "--no-playlist",
        "-x",                          # extract audio only
        "--audio-format",   "mp3",     # convert to mp3
        "--audio-quality",  "192K",    # 192kbps
        "--extractor-args", "youtube:player_client=mweb,android,web",
        "--add-header",     "User-Agent:Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "-o",               "-",       # output to stdout
        yt_url,
    ]

    log.info("stream.ytdlp.pipe.start", track_id=track_id)

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except Exception as e:
        log.error("stream.ytdlp.spawn.failed", error=str(e))
        raise HTTPException(status_code=502, detail="Stream process failed to start")

    # Read first chunk to confirm we're getting audio
    # If first chunk is empty, yt-dlp failed
    first_chunk = await proc.stdout.read(CHUNK)
    if not first_chunk:
        stderr = await proc.stderr.read(2048)
        log.error("stream.ytdlp.no_output",
                  track_id=track_id,
                  stderr=stderr.decode(errors="ignore"))
        proc.kill()
        raise HTTPException(status_code=502,
                            detail="Could not stream this track. YouTube may be blocking requests.")

    log.info("stream.ytdlp.pipe.first_chunk",
             track_id=track_id,
             bytes=len(first_chunk))

    async def _pipe():
        # Yield the first chunk we already read
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
            log.info("stream.ytdlp.pipe.done", track_id=track_id)

    return StreamingResponse(
        _pipe(),
        media_type="audio/mpeg",
        headers={
            "Accept-Ranges":          "bytes",
            "Cache-Control":          "no-cache",
            "X-Content-Type-Options": "nosniff",
        },
    )