from __future__ import annotations
import json
import asyncio
import structlog
from contextlib import asynccontextmanager
from pathlib import Path

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
import socketio

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
    search_router   as search,
    track_router    as tracks,
    download_router as downloads,
    stream_router   as stream,
    lyrics_router   as lyrics,
    playlist_router as playlists,
    settings_router,
)

configure_logging()
log = structlog.get_logger()

AUDIO_EXTS = {"mp3", "flac", "m4a", "ogg", "opus", "wav"}

VERSION = "2.3.0"


# ── CORS ──────────────────────────────────────────────────────
# Always allow:
#   - The prod Render web service
#   - localhost + 127.0.0.1 on any port (dev + Termux)
#   - Capacitor (null origin — APK WebView sends Origin: null)
#
# Additional origins can be added via CORS_ORIGINS env var on Render
# as a comma-separated list or JSON array.

_BUILTIN_ORIGINS = [
    # Prod Render deployments
    "https://shulker-web.onrender.com",
    "https://shulker-api-vnny.onrender.com",
    # Old web service name — keep for backwards compat
    "https://shulker.onrender.com",
    # Local dev
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:8000",
    # Capacitor APK — WebView sends Origin: null for local file:// loads
    "null",
    "capacitor://localhost",
    "http://localhost",
]

def _parse_cors(val: object) -> list[str]:
    if isinstance(val, list):
        return val
    if not val:
        return []
    if isinstance(val, str):
        stripped = val.strip()
        if stripped == "*":
            return ["*"]
        try:
            parsed = json.loads(stripped)
            if isinstance(parsed, list):
                return parsed
        except Exception:
            pass
        return [v.strip() for v in stripped.split(",") if v.strip()]
    return []

_extra = _parse_cors(settings.CORS_ORIGINS)

if "*" in _extra:
    _ALLOWED_ORIGINS: list[str] = ["*"]
else:
    seen: dict[str, None] = {}
    for o in _BUILTIN_ORIGINS + _extra:
        seen[o] = None
    _ALLOWED_ORIGINS = list(seen)


# ── Scheduler ─────────────────────────────────────────────────

scheduler = AsyncIOScheduler(timezone="UTC")


async def _cron_library_scan() -> None:
    try:
        from app.routers.track_router import invalidate_track_index
        from app.routers.stream_router import invalidate_stream_cache
        invalidate_track_index()
        invalidate_stream_cache()
        log.info("cron.library_scan.done")
    except Exception as e:
        log.error("cron.library_scan.error", error=str(e))


async def _cron_ytdlp_update() -> None:
    try:
        proc = await asyncio.create_subprocess_exec(
            "pip", "install", "--upgrade", "--break-system-packages", "yt-dlp",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()
        log.info("cron.ytdlp_update.done")
    except Exception as e:
        log.error("cron.ytdlp_update.error", error=str(e))


async def _cron_job_cleanup() -> None:
    try:
        from app.services.download_service import _jobs
        if len(_jobs) > 100:
            keys = list(_jobs.keys())
            for k in keys[:-100]:
                _jobs.pop(k, None)
        log.info("cron.job_cleanup.done", remaining=len(_jobs))
    except Exception as e:
        log.error("cron.job_cleanup.error", error=str(e))


# ── FastAPI + Socket.IO ───────────────────────────────────────

app = FastAPI(
    title="Shulker API",
    version=VERSION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",   # Socket.IO CORS is handled at the ASGI layer
    logger=False,
    engineio_logger=False,
)

socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

ws_manager.init(sio)
register_events(sio)


# ── Lifespan ──────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(_app: FastAPI):
    log.info("shulker.api.starting", env=settings.ENV, version=VERSION)
    Path(settings.MUSIC_DIR).mkdir(parents=True, exist_ok=True)
    Path(settings.DOWNLOADS_DIR).mkdir(parents=True, exist_ok=True)

    scheduler.add_job(_cron_library_scan, "interval", minutes=30,     id="library_scan",  replace_existing=True)
    scheduler.add_job(_cron_ytdlp_update, "cron",    hour=3,          id="ytdlp_update",  replace_existing=True)
    scheduler.add_job(_cron_job_cleanup,  "interval", hours=6,        id="job_cleanup",   replace_existing=True)
    scheduler.start()

    yield

    scheduler.shutdown(wait=False)
    log.info("shulker.api.stopped")

app.router.lifespan_context = lifespan


# ── Middleware ────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(ShulkerException, shulker_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)


# ── Routes ────────────────────────────────────────────────────

app.include_router(search.router,          prefix="/api/search",    tags=["search"])
app.include_router(tracks.router,          prefix="/api/tracks",    tags=["tracks"])
app.include_router(downloads.router,       prefix="/api/downloads", tags=["downloads"])
app.include_router(stream.router,          prefix="/api/stream",    tags=["stream"])
app.include_router(lyrics.router,          prefix="/api/lyrics",    tags=["lyrics"])
app.include_router(playlists.router,       prefix="/api/playlists", tags=["playlists"])
app.include_router(settings_router.router, prefix="/api/settings",  tags=["settings"])


# ── Health ────────────────────────────────────────────────────

@app.get("/", include_in_schema=False)
async def root():
    return RedirectResponse("/api/docs")


@app.get("/api/health", tags=["health"])
async def health():
    return JSONResponse({
        "status":          "ok",
        "version":         VERSION,
        "env":             settings.ENV,
        "music_dir":       settings.MUSIC_DIR,
        "downloads_dir":   settings.DOWNLOADS_DIR,
        "extra_dirs":      settings.all_music_dirs,
        "spotify":         settings.has_spotify,
        "allowed_origins": _ALLOWED_ORIGINS,
        "cron_jobs": [
            {"id": j.id, "next_run": str(j.next_run_time)}
            for j in scheduler.get_jobs()
        ],
    })