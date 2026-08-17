from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from pathlib import Path

import socketio
import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from app.core.config import settings
from app.core.logging_config import configure_logging
from app.core.exceptions import (
    ShulkerException,
    shulker_exception_handler,
    generic_exception_handler,
)
from app.websocket.ws_manager import ws_manager
from app.websocket.ws_events import register_events
from app.routers import (
    search_router as search,
    track_router as tracks,
    download_router as downloads,
    stream_router as stream,
    lyrics_router as lyrics,
    playlist_router as playlists,
    settings_router,
)

configure_logging()
log = structlog.get_logger()

AUDIO_EXTS = {"mp3", "flac", "m4a", "ogg", "opus", "wav"}


# ── CORS helpers ──────────────────────────────────────────────

def _parse_cors_origins(val) -> list[str]:
    if isinstance(val, list):
        return val
    if not val:
        return ["*"]
    if isinstance(val, str):
        try:
            parsed = json.loads(val)
            if isinstance(parsed, list):
                return parsed
        except Exception:
            return [v.strip() for v in val.split(",") if v.strip()]
    return ["*"]

_ALLOWED_ORIGINS = _parse_cors_origins(settings.CORS_ORIGINS)


# ── Scheduler ─────────────────────────────────────────────────
# The scheduler runs three recurring tasks:
#
# 1. Library scan   (every 30 min) — blows the track index cache so any files
#    the user dropped into MUSIC_DIR manually (not via Shulker) appear in
#    /tracks without a restart.  The stream cache is also invalidated so the
#    next play of a newly-dropped file hits the local file, not yt-dlp.
#
# 2. yt-dlp update  (daily at 03:00) — keeps yt-dlp current so YouTube
#    format-string changes don't silently break streaming / downloads.
#    Runs in an executor so the event loop isn't blocked.
#
# 3. Job cleanup    (every 6 h) — trims the in-memory download job list to
#    the last 100 entries and removes references to jobs whose output files
#    have been deleted (Render ephemeral disk, manual cleanup, etc.).

scheduler = AsyncIOScheduler(timezone="UTC")


async def _cron_library_scan() -> None:
    """
    Invalidate both caches.  The next request to /tracks or /api/stream/*
    will trigger a fresh scan.  No blocking I/O here — the actual scan
    happens lazily on the next request.
    """
    try:
        from app.routers.tracks import invalidate_track_index
        from app.routers.stream import invalidate_stream_cache
        invalidate_track_index()
        invalidate_stream_cache()
        log.info("cron.library_scan.done")
    except Exception as e:
        log.error("cron.library_scan.failed", error=str(e))


async def _cron_ytdlp_update() -> None:
    """
    Run `yt-dlp -U` once a day.  Logged but never fatal — a failed update
    is not worth crashing the application for.
    """
    try:
        proc = await asyncio.create_subprocess_exec(
            "yt-dlp", "-U",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)
        out = (stdout or b"").decode(errors="ignore").strip()
        log.info("cron.ytdlp_update.done", output=out[:200] if out else "no output")
    except asyncio.TimeoutError:
        log.warning("cron.ytdlp_update.timeout")
    except Exception as e:
        log.error("cron.ytdlp_update.failed", error=str(e))


async def _cron_job_cleanup() -> None:
    """
    Trim the in-memory download job store:
    - Keep only the most recent 100 jobs.
    - Remove 'done' jobs whose output file no longer exists on disk.
    """
    try:
        from app.services.download_service import _jobs
        if len(_jobs) <= 100:
            return

        # Sort by createdAt descending, keep newest 100
        sorted_ids = sorted(
            _jobs.keys(),
            key=lambda jid: _jobs[jid].get("createdAt", ""),
            reverse=True,
        )
        stale = sorted_ids[100:]
        for jid in stale:
            _jobs.pop(jid, None)

        # Also prune done-jobs whose files are gone
        for jid, job in list(_jobs.items()):
            if job.get("status") == "done":
                fp = job.get("filePath")
                if fp and not Path(fp).exists():
                    _jobs.pop(jid, None)

        log.info("cron.job_cleanup.done", remaining=len(_jobs))
    except Exception as e:
        log.error("cron.job_cleanup.failed", error=str(e))


# ── Socket.IO ─────────────────────────────────────────────────

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=_ALLOWED_ORIGINS,
    logger=False,
    engineio_logger=False,
)

ws_manager.init(sio)
register_events(sio)


# ── Lifespan ──────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(_app: FastAPI):
    log.info("shulker.api.starting", env=settings.ENV, port=settings.API_PORT)
    Path(settings.MUSIC_DIR).mkdir(parents=True, exist_ok=True)
    Path(settings.DOWNLOADS_DIR).mkdir(parents=True, exist_ok=True)

    # ── Register cron jobs ────────────────────────────────────
    # Library scan every 30 minutes
    scheduler.add_job(
        _cron_library_scan,
        trigger="interval",
        minutes=30,
        id="library_scan",
        replace_existing=True,
    )

    # yt-dlp update daily at 03:00 UTC
    scheduler.add_job(
        _cron_ytdlp_update,
        trigger="cron",
        hour=3,
        minute=0,
        id="ytdlp_update",
        replace_existing=True,
    )

    # Job cleanup every 6 hours
    scheduler.add_job(
        _cron_job_cleanup,
        trigger="interval",
        hours=6,
        id="job_cleanup",
        replace_existing=True,
    )

    scheduler.start()
    log.info(
        "shulker.api.ready",
        music_dir=settings.MUSIC_DIR,
        downloads_dir=settings.DOWNLOADS_DIR,
        extra_dirs=settings.EXTRA_MUSIC_DIRS,
        cron_jobs=[j.id for j in scheduler.get_jobs()],
    )

    yield

    scheduler.shutdown(wait=False)
    log.info("shulker.api.shutdown")


# ── App ───────────────────────────────────────────────────────

app = FastAPI(
    title="Shulker API",
    version="1.3.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(ShulkerException, shulker_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)


# ── Health + root ─────────────────────────────────────────────

@app.get("/", include_in_schema=False)
async def root():
    return RedirectResponse("/api/docs")


@app.get("/api/health", tags=["health"])
async def health():
    return JSONResponse({
        "status":        "ok",
        "version":       "1.3.0",
        "env":           settings.ENV,
        "music_dir":     settings.MUSIC_DIR,
        "downloads_dir": settings.DOWNLOADS_DIR,
        "extra_dirs":    settings.all_music_dirs,
        "spotify":       settings.has_spotify,
        "cron_jobs":     [
            {"id": j.id, "next_run": str(j.next_run_time)}
            for j in scheduler.get_jobs()
        ],
    })


# ── Library endpoints ─────────────────────────────────────────

@app.get("/api/library/featured", tags=["library"])
async def library_featured(limit: int = Query(10, ge=1, le=50)):
    """Featured playlists for the Home page hero carousel."""
    from app.routers.playlists import _load
    playlists_data = list(_load().values())[:limit]
    return [
        {
            "id":         pl["id"],
            "title":      pl["title"],
            "subtitle":   f"{pl.get('trackCount', len(pl.get('tracks', [])))} songs",
            "artworkUrl": pl.get("artworkUrl"),
            "type":       "playlist",
        }
        for pl in playlists_data
    ]


@app.get("/api/library/albums", tags=["library"])
async def library_albums():
    """Albums derived from local library scan — uses cached track index."""
    from app.routers.tracks import _build_index
    idx  = await _build_index()
    seen: dict[str, dict] = {}
    for t in idx.values():
        album_key = t.get("album", {}).get("title") or ""
        if not album_key or album_key in seen:
            continue
        seen[album_key] = {
            "id":          t["album"].get("id") or album_key,
            "title":       t["album"]["title"],
            "artworkUrl":  t.get("artworkUrl"),
            "releaseYear": t["album"].get("releaseYear", 0),
            "trackCount":  sum(
                1 for x in idx.values()
                if x.get("album", {}).get("title") == album_key
            ),
            "artist": t.get("artist"),
        }
    return list(seen.values())


@app.get("/api/library/artists", tags=["library"])
async def library_artists():
    """Artists derived from local library scan — uses cached track index."""
    from app.routers.tracks import _build_index
    idx  = await _build_index()
    seen: dict[str, dict] = {}
    for t in idx.values():
        name = t.get("artist", {}).get("name") or ""
        if not name or name in seen:
            continue
        seen[name] = {
            "id":       t["artist"].get("id") or name,
            "name":     name,
            "imageUrl": t["artist"].get("imageUrl"),
            "genres":   [],
        }
    return list(seen.values())


# ── Routers ───────────────────────────────────────────────────

app.include_router(search.router,          prefix="/api/search",    tags=["search"])
app.include_router(tracks.router,          prefix="/api/tracks",    tags=["tracks"])
app.include_router(downloads.router,       prefix="/api/downloads", tags=["downloads"])
app.include_router(stream.router,          prefix="/api/stream",    tags=["stream"])
app.include_router(lyrics.router,          prefix="/api/lyrics",    tags=["lyrics"])
app.include_router(playlists.router,       prefix="/api/playlists", tags=["playlists"])
app.include_router(settings_router.router, prefix="/api/settings",  tags=["settings"])


# ── Mount Socket.IO ───────────────────────────────────────────
# Must be LAST — wraps the FastAPI app.

socket_app = socketio.ASGIApp(
    socketio_server=sio,
    other_asgi_app=app,
    socketio_path="socket.io",
)