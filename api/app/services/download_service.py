from __future__ import annotations
import asyncio
import json
import re
import shutil
import structlog
import uuid
import yt_dlp
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from app.core.config import settings
from app.websocket.ws_manager import ws_manager

log = structlog.get_logger()

# ── Job store ─────────────────────────────────────────────────
# BUG #21: Jobs are persisted to a JSON file so active downloads survive
# a server restart. Downloaded files themselves always survive (they're on disk).
_JOBS_FILE = Path(settings.DOWNLOADS_DIR) / ".download_jobs.json"

_jobs:  dict[str, dict]          = {}
_tasks: dict[str, asyncio.Task]  = {}

# ── Dynamic concurrency limiter ───────────────────────────────
# Each job declares the max simultaneous downloads for its device
# (Settings → Downloads → Concurrent downloads). Instead of a fixed
# semaphore sized at startup, a condition tracks the live count so the
# limit can change between enqueues without a restart.

_slot_cond: asyncio.Condition | None = None
_active_downloads = 0


def _get_slot_cond() -> asyncio.Condition:
    global _slot_cond
    if _slot_cond is None:
        _slot_cond = asyncio.Condition()
    return _slot_cond


async def _acquire_slot(limit: int) -> None:
    cond = _get_slot_cond()
    async with cond:
        await cond.wait_for(lambda: _active_downloads < limit)
        global _active_downloads
        _active_downloads += 1


async def _release_slot() -> None:
    cond = _get_slot_cond()
    async with cond:
        global _active_downloads
        _active_downloads = max(0, _active_downloads - 1)
        cond.notify_all()


def _load_jobs() -> None:
    """Load persisted jobs from disk on startup."""
    if _JOBS_FILE.exists():
        try:
            data = json.loads(_JOBS_FILE.read_text())
            if isinstance(data, dict):
                for jid, job in data.items():
                    # Reset any mid-flight jobs to 'error' since the server restarted
                    if job.get("status") in ("downloading", "converting", "tagging", "queued"):
                        job["status"] = "error"
                        job["error"]  = "Server restarted during download"
                    _jobs[jid] = job
                log.info("download.jobs.loaded", count=len(_jobs))
        except Exception as e:
            log.warning("download.jobs.load_failed", error=str(e))


def _persist_jobs() -> None:
    """Persist jobs to disk (called after every mutation)."""
    try:
        _JOBS_FILE.parent.mkdir(parents=True, exist_ok=True)
        _JOBS_FILE.write_text(json.dumps(_jobs, default=str))
    except Exception as e:
        log.warning("download.jobs.persist_failed", error=str(e))


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
    embed_metadata: bool = True,
    embed_artwork: bool = True,
    embed_lyrics: bool = True,
    file_naming:  str   = 'artist-title',
    custom_path:  Optional[str] = None,
    retries:      int   = 3,
    speed_limit:  int   = 0,
    concurrency:  int   = 3,
) -> dict:
    return {
        'id':           job_id or str(uuid.uuid4()),
        'trackId':      track_id,
        'title':        title,
        'artist':       artist,
        'artworkUrl':   artwork_url,
        'status':       'downloading',
        'progress':     0.0,
        'format':       fmt,
        'quality':      quality,
        'error':        None,
        'filePath':     None,
        'createdAt':    datetime.now(timezone.utc).isoformat(),
        # Options recorded at enqueue time so retries reproduce them exactly
        'embedMetadata': embed_metadata,
        'embedArtwork':  embed_artwork,
        'embedLyrics':   embed_lyrics,
        'fileNaming':    file_naming,
        'customPath':    custom_path,
        'retries':       retries,
        'speedLimit':    speed_limit,
        'concurrency':   concurrency,
    }


def _update(job_id: str, **kwargs) -> None:
    if job_id in _jobs:
        _jobs[job_id].update(kwargs)
        _persist_jobs()  # BUG #21: persist after every update


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

    # SSRF guard (defense in depth — routers already check, but this service
    # can also be reached from internal flows).
    if url.startswith(('http://', 'https://')):
        from app.services.netguard import ensure_safe_media_url
        ensure_safe_media_url(url)

    if 'spotify.com' in url:
        from app.core.config import settings
        if settings.has_spotify:
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
            # For non-track Spotify URLs (album, playlist, artist), fall through to yt-dlp
        # Use yt-dlp to resolve Spotify URLs (works without credentials)
        log.info("download.spotify.fallback_to_ytdlp", url=url)

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
            # BUG #9: Scale progress to 0-80% for download phase
            progress   = (downloaded / total * 80) if total else 0.0
            _update(job_id, status='downloading', progress=round(progress, 1))
            asyncio.run_coroutine_threadsafe(
                ws_manager.emit_download_progress(
                    job_id, progress, 'downloading',
                    title=_jobs[job_id].get('title'),
                ), loop,
            )
        elif status == 'finished':
            # BUG #9: Report estimated converting progress based on bytes downloaded
            total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
            # Estimate conversion time: ~80-88% range, advancing based on file size
            estimated = min(88.0, 80.0 + (total / 1_000_000 * 0.5))  # 0.5% per MB
            _update(job_id, status='converting', progress=round(estimated, 1))
            asyncio.run_coroutine_threadsafe(
                ws_manager.emit_download_progress(
                    job_id, estimated, 'converting',
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

_AUDIO_EXTS = {'.mp3', '.m4a', '.flac', '.opus', '.wav', '.ogg'}


async def _run_download(
    job_id:        str,
    yt_url:        str,
    artist:        str,
    playlist_name: Optional[str] = None,
) -> Optional[Path]:
    """Download + convert one job, honoring its recorded options.

    The file is first written to a per-job staging directory inside
    DOWNLOADS_DIR, then moved to its final location. This makes custom
    paths and naming rules exact — the server composes the final file
    from the resolved title/artist instead of trusting yt-dlp's template.
    """
    job = _jobs.get(job_id, {})
    fmt            = job.get('format', 'mp3')
    quality        = job.get('quality', '320')
    embed_artwork  = job.get('embedArtwork', True)
    embed_metadata = job.get('embedMetadata', True)
    retries        = max(0, int(job.get('retries', 3)))
    speed_limit    = max(0, int(job.get('speedLimit', 0)))
    file_naming    = job.get('fileNaming', 'artist-title')
    custom_path    = (job.get('customPath') or '').strip() or None
    concurrency    = max(1, int(job.get('concurrency', settings.MAX_CONCURRENT_DOWNLOADS)))

    loop      = asyncio.get_event_loop()
    quality_q = '0' if quality == 'best' else quality

    staging = _staging_dir(job_id)
    shutil.rmtree(staging, ignore_errors=True)
    staging.mkdir(parents=True, exist_ok=True)
    out_tmpl = str(staging / '%(title)s.%(ext)s')

    postprocessors: list[dict] = [
        {'key': 'FFmpegExtractAudio', 'preferredcodec': fmt, 'preferredquality': quality_q},
    ]
    if embed_metadata:
        postprocessors.append({'key': 'FFmpegMetadata'})
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
        'addmetadata':      embed_metadata,
        'retries':          retries,
        'fragment_retries': retries,
    }
    if speed_limit > 0:
        ydl_opts['limit_rate'] = f'{speed_limit}K'

    def _do() -> Optional[Path]:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.extract_info(yt_url, download=True)
        files = [
            p for p in staging.iterdir()
            if p.is_file() and p.suffix.lower() in _AUDIO_EXTS
        ]
        return max(files, key=lambda p: p.stat().st_mtime) if files else None

    await _acquire_slot(concurrency)
    try:
        raw = await loop.run_in_executor(None, _do)
    finally:
        await _release_slot()

    if not raw or not raw.exists():
        shutil.rmtree(staging, ignore_errors=True)
        return None

    # ── Compose final location from resolved metadata ─────────
    music_dir = Path(settings.MUSIC_DIR)
    title_s   = _sanitize(job.get('title', 'Unknown Title'))
    artist_s  = _sanitize(artist or 'Unknown Artist')
    track_id  = _sanitize(job.get('trackId', ''))

    # Default library layout (no custom path): keep the Artist/ folder
    # structure the library scanner expects; the naming option only picks
    # the file name inside it.
    if custom_path:
        final_dir = Path(custom_path).expanduser()
        stem = {
            'artist-title': f'{artist_s} - {title_s}',
            'title-artist': f'{title_s} - {artist_s}',
            'id':           track_id or title_s,
        }.get(file_naming, f'{artist_s} - {title_s}')
    elif playlist_name:
        final_dir = music_dir / _sanitize(playlist_name) / artist_s
        stem = track_id if file_naming == 'id' else title_s
    else:
        final_dir = music_dir / artist_s
        stem = track_id if file_naming == 'id' else title_s

    final_dir.mkdir(parents=True, exist_ok=True)
    ext        = raw.suffix.lower() or f'.{fmt}'
    final_path = final_dir / f'{stem}{ext}'
    counter    = 1
    while final_path.exists():
        final_path = final_dir / f'{stem} ({counter}){ext}'
        counter   += 1

    # shutil.move handles cross-device moves (Termux: cache → sdcard)
    shutil.move(str(raw), str(final_path))
    try:
        shutil.rmtree(staging, ignore_errors=True)
    except Exception:
        pass
    return final_path

# ── Tag + finish ──────────────────────────────────────────────

def _staging_dir(job_id: str) -> Path:
    return Path(settings.DOWNLOADS_DIR) / f'.staging-{job_id}'


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
    artist:        str,
    playlist_name: Optional[str] = None,
) -> None:
    try:
        _update(job_id, status='downloading', progress=0.0)
        await ws_manager.emit_download_progress(job_id, 0.0, 'downloading')

        file_path = await _run_download(job_id, yt_url, artist, playlist_name)
        if not file_path or not file_path.exists():
            raise RuntimeError('Output file not found after download')

        job = _jobs[job_id]
        await _tag_and_finish(
            job_id, file_path,
            job.get('title', ''), job.get('artist', ''),
            job.get('artworkUrl', ''), job.get('embedLyrics', True),
        )

        _update(job_id, status='done', progress=100.0, filePath=str(file_path))
        await ws_manager.emit_download_done(job_id, str(file_path))
        log.info('download.done', job_id=job_id, path=str(file_path))

        # Invalidate the stream cache so the new file is found on the very
        # next play request without requiring a server restart.
        # NOTE: module is stream_router (not stream) — the wrong import below
        # used to fail silently, so newly downloaded files stayed invisible to
        # /stream and /tracks until the 30-minute cron rescanned.
        try:
            from app.routers.stream_router import invalidate_stream_cache
            invalidate_stream_cache()
        except Exception as e:
            log.warning('download.stream_cache.invalidate.failed', error=str(e))

        # Invalidate the track index so /tracks and /tracks/recently-played
        # immediately reflect the new file (module is track_router, not tracks).
        try:
            from app.routers.track_router import invalidate_track_index
            invalidate_track_index()
        except Exception as e:
            log.warning('download.track_index.invalidate.failed', error=str(e))

    except asyncio.CancelledError:
        # BUG #16: Use 'cancelled' status instead of generic 'error' so the
        # frontend can distinguish user-initiated cancellation from failures.
        _update(job_id, status='cancelled', error='Cancelled by user')
        shutil.rmtree(_staging_dir(job_id), ignore_errors=True)
        await ws_manager.emit_download_error(job_id, 'Cancelled by user')
    except Exception as e:
        log.error('download.failed', job_id=job_id, error=str(e))
        # Clean up the staging dir so failed/cancelled downloads can't leak
        # partially-written files on disk.
        shutil.rmtree(_staging_dir(job_id), ignore_errors=True)
        # BUG #16: Set the correct intermediate status based on where it failed
        current = _jobs.get(job_id, {}).get('status', 'error')
        if current == 'downloading':
            _update(job_id, status='error', error=f'Download failed: {e}')
        elif current == 'converting':
            _update(job_id, status='error', error=f'Conversion failed: {e}')
        elif current == 'tagging':
            _update(job_id, status='error', error=f'Tagging failed: {e}')
        else:
            _update(job_id, status='error', error=str(e))
        await ws_manager.emit_download_error(job_id, str(e))
    finally:
        _tasks.pop(job_id, None)

# ── Init: load persisted jobs on first use ────────────────────
_jobs_loaded = False


async def enqueue_download(
    track_id:        Optional[str] = None,
    url:             Optional[str] = None,
    fmt:             str           = 'mp3',
    quality:         str           = '320',
    embed_artwork:   bool          = True,
    embed_lyrics:    bool          = True,
    embed_metadata:  bool          = True,
    file_naming:     str           = 'artist-title',
    custom_path:     Optional[str] = None,
    retries:         int           = 3,
    speed_limit:     int           = 0,
    concurrency:     int           = 3,
    job_id:          Optional[str] = None,
    playlist_name:   Optional[str] = None,
) -> dict:
    global _jobs_loaded
    # BUG #21: Load persisted jobs on first use
    if not _jobs_loaded:
        _load_jobs()
        _jobs_loaded = True
    try:
        yt_url, title, artist, artwork_url = await _resolve_to_yt_url(track_id, url)
    except Exception as e:
        job              = _new_job(
            track_id or '', url or '', '', '', fmt, quality, job_id,
            embed_metadata=embed_metadata, embed_artwork=embed_artwork,
            embed_lyrics=embed_lyrics, file_naming=file_naming,
            custom_path=custom_path, retries=retries,
            speed_limit=speed_limit, concurrency=concurrency,
        )
        job['status']    = 'error'
        job['error']     = str(e)
        _jobs[job['id']] = job
        log.error('download.resolve.failed', error=str(e))
        return job

    job              = _new_job(
        track_id or '', title, artist, artwork_url, fmt, quality, job_id,
        embed_metadata=embed_metadata, embed_artwork=embed_artwork,
        embed_lyrics=embed_lyrics, file_naming=file_naming,
        custom_path=custom_path, retries=retries,
        speed_limit=speed_limit, concurrency=concurrency,
    )
    _jobs[job['id']] = job

    task = asyncio.create_task(
        _download_task(job['id'], yt_url, artist, playlist_name),
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
        # BUG #6: Wait with explicit timeout, then force-kill if needed
        try:
            await asyncio.wait_for(asyncio.shield(task), timeout=3.0)
        except asyncio.TimeoutError:
            log.warning("cancel_job.task_timeout", job_id=job_id)
            task.cancel()  # second cancel attempt
        except asyncio.CancelledError:
            pass  # expected
    _update(job_id, status='cancelled', error='Cancelled by user')
    await ws_manager.emit_download_error(job_id, 'Cancelled by user')
    return True


async def retry_job(job_id: str) -> Optional[dict]:
    job = _jobs.get(job_id)
    if not job:
        return None
    # BUG #6: Ensure old task is fully stopped before retrying
    old_task = _tasks.pop(job_id, None)
    if old_task and not old_task.done():
        old_task.cancel()
        try:
            await asyncio.wait_for(asyncio.shield(old_task), timeout=2.0)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            pass
    _update(job_id, status='queued', progress=0.0, error=None)
    return await enqueue_download(
        track_id=job.get('trackId') or None,
        fmt=job.get('format', 'mp3'),
        quality=job.get('quality', '320'),
        embed_artwork=job.get('embedArtwork', True),
        embed_lyrics=job.get('embedLyrics', True),
        embed_metadata=job.get('embedMetadata', True),
        file_naming=job.get('fileNaming', 'artist-title'),
        custom_path=job.get('customPath') or None,
        retries=int(job.get('retries', 3)),
        speed_limit=int(job.get('speedLimit', 0)),
        concurrency=int(job.get('concurrency', settings.MAX_CONCURRENT_DOWNLOADS)),
        job_id=job_id,
    )