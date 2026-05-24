from __future__ import annotations
import asyncio
import uuid
import yt_dlp
import structlog
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.core.config import settings
from app.websocket.manager import ws_manager
from app.services.spotify_service import (
    detect_spotify_type,
    extract_spotify_id,
    get_track as sp_get_track,
)
from app.services.ytmusic_service import search_one

log = structlog.get_logger()

# ── In-memory job store ───────────────────────────────────────
_jobs: dict[str, dict] = {}

# Semaphore — cap concurrent yt-dlp processes
_sem: asyncio.Semaphore | None = None


def _get_sem() -> asyncio.Semaphore:
    global _sem
    if _sem is None:
        _sem = asyncio.Semaphore(settings.MAX_CONCURRENT_DOWNLOADS)
    return _sem


# ── Job helpers ───────────────────────────────────────────────

def _new_job(
    track_id:    str,
    title:       str,
    artist:      str,
    artwork_url: str,
    fmt:         str,
    quality:     str,
) -> dict:
    return {
        "id":         str(uuid.uuid4()),
        "trackId":    track_id,
        "title":      title,
        "artist":     artist,
        "artworkUrl": artwork_url,
        "status":     "queued",
        "progress":   0.0,
        "format":     fmt,
        "quality":    quality,
        "error":      None,
        "filePath":   None,
        "createdAt":  datetime.utcnow().isoformat(),
    }


def _update(job_id: str, **kwargs) -> None:
    if job_id in _jobs:
        _jobs[job_id].update(kwargs)


def get_all_jobs() -> list[dict]:
    return list(reversed(list(_jobs.values())))


def get_job(job_id: str) -> dict | None:
    return _jobs.get(job_id)


# ── URL resolution ────────────────────────────────────────────

async def _resolve_to_yt_url(
    track_id: Optional[str],
    url:      Optional[str],
) -> tuple[str, str, str, str]:
    """
    Returns (yt_url, title, artist, artwork_url).
    Handles: YouTube video ID, Spotify track URL, any yt-dlp URL.
    """
    # Direct YouTube video ID (11 chars, no http)
    if track_id and not track_id.startswith("http"):
        from app.services.ytmusic_service import get_track as yt_get
        try:
            t = await yt_get(track_id)
            return (
                f"https://www.youtube.com/watch?v={track_id}",
                t.get("title", ""),
                t.get("artist", {}).get("name", ""),
                t.get("artworkUrl", ""),
            )
        except Exception:
            return (
                f"https://www.youtube.com/watch?v={track_id}",
                track_id, "", "",
            )

    if not url:
        raise ValueError("Either trackId or url must be provided")

    # Spotify track URL
    if "spotify.com" in url:
        sp_type = detect_spotify_type(url)
        if sp_type == "track":
            sid   = extract_spotify_id(url, "track")
            sp    = await sp_get_track(sid)
            query = f"{sp['title']} {sp['artist']['name']}"
            yt    = await search_one(query)
            if yt:
                return (
                    f"https://www.youtube.com/watch?v={yt['youtubeId']}",
                    sp["title"],
                    sp["artist"]["name"],
                    sp.get("artworkUrl", ""),
                )
        raise ValueError(
            "Only Spotify track URLs can be downloaded directly. "
            "For albums/playlists, download tracks individually."
        )

    # Any other URL — pass to yt-dlp info extractor
    loop = asyncio.get_event_loop()

    def _info():
        with yt_dlp.YoutubeDL({"quiet": True, "skip_download": True}) as ydl:
            return ydl.extract_info(url, download=False)

    info   = await loop.run_in_executor(None, _info)
    title  = info.get("title", "")
    artist = info.get("uploader") or info.get("channel") or ""
    thumbs = info.get("thumbnails") or []
    art    = thumbs[-1].get("url", "") if thumbs else ""

    return url, title, artist, art


# ── yt-dlp progress hook ──────────────────────────────────────

def _make_hook(job_id: str, loop: asyncio.AbstractEventLoop):
    def hook(d: dict):
        status = d.get("status")

        if status == "downloading":
            total      = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            downloaded = d.get("downloaded_bytes", 0)
            progress   = (downloaded / total * 80) if total else 0  # 0–80% during download
            _update(job_id, status="downloading", progress=round(progress, 1))
            asyncio.run_coroutine_threadsafe(
                ws_manager.emit_download_progress(
                    job_id, progress, "downloading",
                    title=_jobs[job_id].get("title"),
                ),
                loop,
            )

        elif status == "finished":
            _update(job_id, status="converting", progress=82.0)
            asyncio.run_coroutine_threadsafe(
                ws_manager.emit_download_progress(
                    job_id, 82.0, "converting",
                    title=_jobs[job_id].get("title"),
                ),
                loop,
            )

    return hook


# ── Core yt-dlp download ──────────────────────────────────────

async def _run_download(job_id: str, yt_url: str, fmt: str, quality: str) -> Optional[Path]:
    out_dir   = Path(settings.DOWNLOADS_DIR)
    out_dir.mkdir(parents=True, exist_ok=True)
    loop      = asyncio.get_event_loop()
    quality_q = "0" if quality == "best" else quality

    ydl_opts = {
        "format":      "bestaudio/best",
        "outtmpl":     str(out_dir / "%(title)s.%(ext)s"),
        "quiet":       True,
        "no_warnings": True,
        "noplaylist":  True,
        "progress_hooks": [_make_hook(job_id, loop)],
        "postprocessors": [
            {
                "key":              "FFmpegExtractAudio",
                "preferredcodec":   fmt,
                "preferredquality": quality_q,
            },
            {"key": "FFmpegMetadata"},
            {"key": "EmbedThumbnail"},
        ],
        "writethumbnail": True,
        "embedthumbnail": True,
        "addmetadata":    True,
    }

    def _do() -> Optional[Path]:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info  = ydl.extract_info(yt_url, download=True)
            title = info.get("title", "")

            # Find the output file by matching title prefix
            for p in out_dir.glob(f"*.{fmt}"):
                if title[:20].lower() in p.stem.lower():
                    return p

            # Fallback — most recently modified file
            files = sorted(
                out_dir.glob(f"*.{fmt}"),
                key=lambda x: x.stat().st_mtime,
                reverse=True,
            )
            return files[0] if files else None

    async with _get_sem():
        return await loop.run_in_executor(None, _do)


# ── Tagging ───────────────────────────────────────────────────

async def _tag_and_finish(
    job_id:       str,
    file_path:    Path,
    title:        str,
    artist:       str,
    artwork_url:  str,
    embed_lyrics: bool,
) -> None:
    _update(job_id, status="tagging", progress=90.0)
    await ws_manager.emit_download_progress(job_id, 90.0, "tagging")

    try:
        from app.services.artwork_service import fetch_remote_artwork
        from app.services.metadata_service import write_tags

        artwork = await fetch_remote_artwork(artwork_url) if artwork_url else b""

        lyrics_text = ""
        if embed_lyrics:
            try:
                from app.services.lyrics_service import get_lyrics_text
                lyrics_text = await get_lyrics_text(
                    _jobs[job_id].get("trackId", ""), title, artist
                )
            except Exception:
                pass

        write_tags(
            file_path,
            title=title,
            artist=artist,
            album="",
            artwork=artwork,
            lyrics=lyrics_text,
        )
    except Exception as e:
        log.warning("download.tag.failed", job_id=job_id, error=str(e))


# ── Background download task ──────────────────────────────────

async def _download_task(
    job_id:       str,
    yt_url:       str,
    fmt:          str,
    quality:      str,
    embed_lyrics: bool,
) -> None:
    try:
        _update(job_id, status="downloading", progress=0.0)
        await ws_manager.emit_download_progress(job_id, 0.0, "downloading")

        file_path = await _run_download(job_id, yt_url, fmt, quality)

        if not file_path or not file_path.exists():
            raise RuntimeError("Output file not found after download")

        job = _jobs[job_id]
        await _tag_and_finish(
            job_id,
            file_path,
            job.get("title", ""),
            job.get("artist", ""),
            job.get("artworkUrl", ""),
            embed_lyrics,
        )

        _update(job_id, status="done", progress=100.0, filePath=str(file_path))
        await ws_manager.emit_download_done(job_id, str(file_path))
        log.info("download.done", job_id=job_id, path=str(file_path))

    except Exception as e:
        log.error("download.failed", job_id=job_id, error=str(e))
        _update(job_id, status="error", error=str(e))
        await ws_manager.emit_download_error(job_id, str(e))


# ── Public API ────────────────────────────────────────────────

async def enqueue_download(
    track_id:      Optional[str] = None,
    url:           Optional[str] = None,
    fmt:           str           = "mp3",
    quality:       str           = "320",
    embed_artwork: bool          = True,
    embed_lyrics:  bool          = True,
) -> dict:
    """
    Enqueue a download. Returns immediately with job metadata.
    Download runs in background, progress sent over WebSocket.
    """
    try:
        yt_url, title, artist, artwork_url = await _resolve_to_yt_url(track_id, url)
    except Exception as e:
        job              = _new_job(track_id or "", url or "", "", "", fmt, quality)
        job["status"]    = "error"
        job["error"]     = str(e)
        _jobs[job["id"]] = job
        return job

    job              = _new_job(track_id or "", title, artist, artwork_url, fmt, quality)
    _jobs[job["id"]] = job

    asyncio.create_task(_download_task(job["id"], yt_url, fmt, quality, embed_lyrics))

    return job


async def cancel_job(job_id: str) -> bool:
    if job_id not in _jobs:
        return False
    _update(job_id, status="error", error="Cancelled by user")
    return True


async def retry_job(job_id: str) -> Optional[dict]:
    job = _jobs.get(job_id)
    if not job:
        return None
    return await enqueue_download(
        track_id=job.get("trackId") or None,
        url=None,
        fmt=job.get("format", "mp3"),
        quality=job.get("quality", "320"),
    )