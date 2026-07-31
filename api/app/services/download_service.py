from __future__ import annotations
import asyncio
import re
import uuid
import yt_dlp
import structlog
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.core.config import settings
from app.websocket.manager import ws_manager

log = structlog.get_logger()

# ── Job store ─────────────────────────────────────────────────
# In-memory only — jobs do not survive a server restart. That's expected
# behaviour; the downloaded files themselves survive and appear in the
# library via the file-system scan. The Downloads page Activity tab is
# session-scoped.

_jobs:  dict[str, dict]          = {}
_tasks: dict[str, asyncio.Task]  = {}
_sem:   asyncio.Semaphore | None = None


def _get_sem() -> asyncio.Semaphore:
    global _sem
    if _sem is None:
        _sem = asyncio.Semaphore(settings.MAX_CONCURRENT_DOWNLOADS)
    return _sem


def _sanitize(name: str) -> str:
    """Strip characters that break file names on Android / Termux / Windows."""
    name = re.sub(r'[<>:"/\\|?*]', '', name).strip()
    return name or 'Unknown'


def _new_job(
    track_id:    str,
    title:       str,
    artist:      str,
    artwork_url: str,
    fmt:         str,
    quality:     str,
    job_id:      str | None = None,
) -> dict:
    return {
        'id':         job_id or str(uuid.uuid4()),
        'trackId':    track_id,
        'title':      title,
        'artist':     artist,
        'artworkUrl': artwork_url,
        'status':     'downloading',
        'progress':   0.0,
        'format':     fmt,
        'quality':    quality,
        'error':      None,
        'filePath':   None,
        'createdAt':  datetime.utcnow().isoformat(),
    }


def _update(job_id: str, **kwargs) -> None:
    if job_id in _jobs:
        _jobs[job_id].update(kwargs)


def get_all_jobs()       -> list[dict]: return list(reversed(list(_jobs.values())))
def get_job(job_id: str) -> dict | None: return _jobs.get(job_id)

# ── URL resolution ────────────────────────────────────────────

async def _resolve_to_yt_url(
    track_id: Optional[str],
    url:      Optional[str],
) -> tuple[str, str, str, str]:
    """Return (yt_url, title, artist, artwork_url)."""
    if track_id and not track_id.startswith('http'):
        from app.services.ytmusic_service import get_track as yt_get
        try:
            t = await yt_get(track_id)
            return (
                f'https://www.youtube.com/watch?v={track_id}',
                t.get('title', ''),
                t.get('artist', {}).get('name', ''),
                t.get('artworkUrl', ''),
            )
        except Exception:
            return (f'https://www.youtube.com/watch?v={track_id}', track_id, '', '')

    if not url:
        raise ValueError('Either trackId or url must be provided')

    if 'spotify.com' in url:
        from app.services.spotify_service import (
            detect_spotify_type, extract_spotify_id, get_track as sp_get,
        )
        from app.services.ytmusic_service import search_one
        sp_type = detect_spotify_type(url)
        if sp_type == 'track':
            sid   = extract_spotify_id(url, 'track')
            sp    = await sp_get(sid)
            query = f"{sp['title']} {sp['artist']['name']}"
            yt    = await search_one(query)
            if yt:
                return (
                    f"https://www.youtube.com/watch?v={yt['youtubeId']}",
                    sp['title'], sp['artist']['name'], sp.get('artworkUrl', ''),
                )
        raise ValueError('Only Spotify track URLs are supported for download.')

    loop = asyncio.get_event_loop()
    def _info():
        with yt_dlp.YoutubeDL({'quiet': True, 'skip_download': True}) as ydl:
            return ydl.extract_info(url, download=False)
    info   = await loop.run_in_executor(None, _info)
    title  = info.get('title', '')
    artist = info.get('uploader') or info.get('channel') or ''
    thumbs = info.get('thumbnails') or []
    art    = thumbs[-1].get('url', '') if thumbs else ''
    return url, title, artist, art

# ── Progress hook ─────────────────────────────────────────────

def _make_hook(job_id: str, loop: asyncio.AbstractEventLoop):
    def hook(d: dict):
        status = d.get('status')
        if status == 'downloading':
            total      = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
            downloaded = d.get('downloaded_bytes', 0)
            progress   = (downloaded / total * 80) if total else 0.0
            _update(job_id, status='downloading', progress=round(progress, 1))
            asyncio.run_coroutine_threadsafe(
                ws_manager.emit_download_progress(
                    job_id, progress, 'downloading',
                    title=_jobs[job_id].get('title'),
                ), loop,
            )
        elif status == 'finished':
            _update(job_id, status='converting', progress=82.0)
            asyncio.run_coroutine_threadsafe(
                ws_manager.emit_download_progress(
                    job_id, 82.0, 'converting',
                    title=_jobs[job_id].get('title'),
                ), loop,
            )
    return hook

# ── yt-dlp download ───────────────────────────────────────────
# Files land in MUSIC_DIR — the directory the library scanner reads.
# Layout:  MUSIC_DIR/<Artist>/<Title>.<ext>
#
# Previously files were written to DOWNLOADS_DIR which nothing ever read.
# That is the "downloads don't appear in library" bug fix.

async def _run_download(
    job_id:        str,
    yt_url:        str,
    fmt:           str,
    quality:       str,
    embed_artwork: bool,
    artist:        str,
    playlist_name: Optional[str] = None,
) -> Optional[Path]:
    music_dir = Path(settings.MUSIC_DIR)

    base_dir   = (music_dir / _sanitize(playlist_name)) if playlist_name else music_dir
    artist_dir = base_dir / _sanitize(artist or 'Unknown Artist')
    artist_dir.mkdir(parents=True, exist_ok=True)

    loop      = asyncio.get_event_loop()
    quality_q = '0' if quality == 'best' else quality
    out_tmpl  = str(artist_dir / '%(title)s.%(ext)s')

    postprocessors: list[dict] = [
        {'key': 'FFmpegExtractAudio', 'preferredcodec': fmt, 'preferredquality': quality_q},
        {'key': 'FFmpegMetadata'},
    ]
    if embed_artwork:
        postprocessors.append({'key': 'EmbedThumbnail'})

    ydl_opts = {
        'format':           'bestaudio/best',
        'outtmpl':          out_tmpl,
        'quiet':            True,
        'no_warnings':      True,
        'noplaylist':       True,
        'progress_hooks':   [_make_hook(job_id, loop)],
        'postprocessors':   postprocessors,
        'writethumbnail':   embed_artwork,
        'embedthumbnail':   embed_artwork,
        'addmetadata':      True,
        'retries':          3,
        'fragment_retries': 3,
    }

    def _do() -> Optional[Path]:
        before = {p for p in artist_dir.glob(f'*.{fmt}')}
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.extract_info(yt_url, download=True)
        after    = {p for p in artist_dir.glob(f'*.{fmt}')}
        new_files = after - before
        if new_files:
            return max(new_files, key=lambda p: p.stat().st_mtime)
        files = sorted(artist_dir.glob(f'*.{fmt}'), key=lambda p: p.stat().st_mtime, reverse=True)
        return files[0] if files else None

    async with _get_sem():
        return await loop.run_in_executor(None, _do)

# ── Tag + finish ──────────────────────────────────────────────

async def _tag_and_finish(
    job_id:       str,
    file_path:    Path,
    title:        str,
    artist:       str,
    artwork_url:  str,
    embed_lyrics: bool,
) -> None:
    _update(job_id, status='tagging', progress=90.0)
    await ws_manager.emit_download_progress(job_id, 90.0, 'tagging')
    try:
        from app.services.artwork_service import fetch_remote_artwork
        from app.services.metadata_service import write_tags
        artwork     = await fetch_remote_artwork(artwork_url) if artwork_url else b''
        lyrics_text = ''
        if embed_lyrics:
            try:
                from app.services.lyrics_service import get_lyrics_text
                lyrics_text = await get_lyrics_text(
                    _jobs[job_id].get('trackId', ''), title, artist,
                )
            except Exception as e:
                log.warning('download.lyrics.failed', job_id=job_id, error=str(e))
        write_tags(file_path, title=title, artist=artist, album='', artwork=artwork, lyrics=lyrics_text)
    except Exception as e:
        log.warning('download.tag.failed', job_id=job_id, error=str(e))

# ── Background task ───────────────────────────────────────────

async def _download_task(
    job_id:        str,
    yt_url:        str,
    fmt:           str,
    quality:       str,
    embed_lyrics:  bool,
    embed_artwork: bool,
    artist:        str,
    playlist_name: Optional[str] = None,
) -> None:
    try:
        _update(job_id, status='downloading', progress=0.0)
        await ws_manager.emit_download_progress(job_id, 0.0, 'downloading')

        file_path = await _run_download(job_id, yt_url, fmt, quality, embed_artwork, artist, playlist_name)
        if not file_path or not file_path.exists():
            raise RuntimeError('Output file not found after download')

        job = _jobs[job_id]
        await _tag_and_finish(
            job_id, file_path,
            job.get('title', ''), job.get('artist', ''),
            job.get('artworkUrl', ''), embed_lyrics,
        )

        _update(job_id, status='done', progress=100.0, filePath=str(file_path))
        await ws_manager.emit_download_done(job_id, str(file_path))
        log.info('download.done', job_id=job_id, path=str(file_path))

        # Invalidate the stream cache so the new file is found on the very
        # next play request without requiring a server restart.
        try:
            from app.routers.stream import invalidate_stream_cache
            invalidate_stream_cache()
        except Exception as e:
            log.warning('download.stream_cache.invalidate.failed', error=str(e))

        # Invalidate the track index so /tracks and /tracks/recently-played
        # immediately reflect the new file.
        # FIX: previously called a non-existent function silently. The function
        # now exists in tracks.py and is imported correctly.
        try:
            from app.routers.tracks import invalidate_track_index
            invalidate_track_index()
        except Exception as e:
            log.warning('download.track_index.invalidate.failed', error=str(e))

    except asyncio.CancelledError:
        _update(job_id, status='error', error='Cancelled')
        await ws_manager.emit_download_error(job_id, 'Cancelled')
    except Exception as e:
        log.error('download.failed', job_id=job_id, error=str(e))
        _update(job_id, status='error', error=str(e))
        await ws_manager.emit_download_error(job_id, str(e))
    finally:
        _tasks.pop(job_id, None)

# ── Public API ────────────────────────────────────────────────

async def enqueue_download(
    track_id:      Optional[str] = None,
    url:           Optional[str] = None,
    fmt:           str           = 'mp3',
    quality:       str           = '320',
    embed_artwork: bool          = True,
    embed_lyrics:  bool          = True,
    job_id:        Optional[str] = None,
    playlist_name: Optional[str] = None,
) -> dict:
    try:
        yt_url, title, artist, artwork_url = await _resolve_to_yt_url(track_id, url)
    except Exception as e:
        job              = _new_job(track_id or '', url or '', '', '', fmt, quality, job_id)
        job['status']    = 'error'
        job['error']     = str(e)
        _jobs[job['id']] = job
        log.error('download.resolve.failed', error=str(e))
        return job

    job              = _new_job(track_id or '', title, artist, artwork_url, fmt, quality, job_id)
    _jobs[job['id']] = job

    task = asyncio.create_task(
        _download_task(
            job['id'], yt_url, fmt, quality, embed_lyrics, embed_artwork,
            artist, playlist_name,
        ),
    )
    _tasks[job['id']] = task
    log.info('download.enqueued', job_id=job['id'], title=title, playlist=playlist_name)
    return job


async def cancel_job(job_id: str) -> bool:
    if job_id not in _jobs:
        return False
    task = _tasks.pop(job_id, None)
    if task and not task.done():
        task.cancel()
        try:
            await asyncio.wait_for(asyncio.shield(task), timeout=2.0)
        except (asyncio.CancelledError, asyncio.TimeoutError):
            pass
    _update(job_id, status='error', error='Cancelled by user')
    return True


async def retry_job(job_id: str) -> Optional[dict]:
    job = _jobs.get(job_id)
    if not job:
        return None
    _update(job_id, status='queued', progress=0.0, error=None)
    return await enqueue_download(
        track_id=job.get('trackId') or None,
        fmt=job.get('format', 'mp3'),
        quality=job.get('quality', '320'),
        embed_artwork=True,
        embed_lyrics=True,
        job_id=job_id,
    )