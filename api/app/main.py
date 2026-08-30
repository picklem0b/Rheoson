from __future__ import annotations
import asyncio
import os
import json
import shutil
import time
import structlog

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

import httpx
import socketio
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

VERSION     = "2.10.25"
_START_TIME = time.monotonic()

AUDIO_EXTS = {"mp3", "flac", "m4a", "ogg", "opus", "wav"}

# ── CORS ──────────────────────────────────────────────────────

_BUILTIN_ORIGINS = [
    "https://shulker-web.onrender.com",
    "https://shulker-api-vnny.onrender.com",
    "https://shulker.onrender.com",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:8000",
    "capacitor://localhost",
    "http://localhost",
]

def _parse_cors(val: object) -> list[str]:
    if isinstance(val, list):
        return val
    if not val:
        return []
    if isinstance(val, str):
        s = val.strip()
        if s == "*":
            return ["*"]
        try:
            parsed = json.loads(s)
            if isinstance(parsed, list):
                return parsed
        except Exception:
            pass
        return [v.strip() for v in s.split(",") if v.strip()]
    return []

_extra = _parse_cors(settings.CORS_ORIGINS)
if "*" in _extra:
    _ALLOWED_ORIGINS: list[str] = ["*"]
else:
    _seen: dict[str, None] = {}
    for o in _BUILTIN_ORIGINS + _extra:
        _seen[o] = None
    _ALLOWED_ORIGINS = list(_seen)

# ── Scheduler ─────────────────────────────────────────────────

scheduler = AsyncIOScheduler(timezone="UTC")

_keep_alive_stats: dict = {
    "last_ping":       None,
    "last_status":     None,
    "last_latency_ms": None,
    "total_pings":     0,
    "total_failures":  0,
}


async def _cron_keep_alive() -> None:
    url = f"http://127.0.0.1:{settings.API_PORT}/api/health" if settings.is_dev else f"https://shulker-api-vnny.onrender.com/api/health"
    t0  = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(url)
        latency = round((time.monotonic() - t0) * 1000)
        _keep_alive_stats.update({
            "last_ping":       datetime.now(timezone.utc).isoformat(),
            "last_status":     resp.status_code,
            "last_latency_ms": latency,
            "total_pings":     _keep_alive_stats["total_pings"] + 1,
        })
        log.info("cron.keep_alive.ok", status=resp.status_code, latency_ms=latency)
    except Exception as e:
        _keep_alive_stats.update({
            "last_ping":      datetime.now(timezone.utc).isoformat(),
            "last_status":    "error",
            "total_pings":    _keep_alive_stats["total_pings"]   + 1,
            "total_failures": _keep_alive_stats["total_failures"] + 1,
        })
        log.warning("cron.keep_alive.failed", error=str(e))


async def _cron_library_scan() -> None:
    try:
        from app.routers.track_router import invalidate_track_index
        from app.routers.stream_router import invalidate_stream_cache, cleanup_expired_buffers, _failure_cache
        invalidate_track_index()
        invalidate_stream_cache()
        # Clean stale failure cache entries during periodic scan
        import time as _time
        now = _time.monotonic()
        stale = [k for k, exp in _failure_cache.items() if exp <= now]
        for k in stale:
            _failure_cache.pop(k, None)
        if stale:
            log.info("cron.failure_cache.cleaned", count=len(stale))
        # Clean expired remote stream buffers
        cleanup_expired_buffers()
        log.info("cron.library_scan.done")
    except Exception as e:
        log.error("cron.library_scan.failed", error=str(e))


async def _cron_ytdlp_update() -> None:
    try:
        proc = await asyncio.create_subprocess_exec(
            "yt-dlp", "-U",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=120)
        out = (stdout or b"").decode(errors="ignore").strip()
        log.info("cron.ytdlp_update.done", output=out[:200] if out else "no output")
    except asyncio.TimeoutError:
        log.warning("cron.ytdlp_update.timeout")
    except Exception as e:
        log.error("cron.ytdlp_update.failed", error=str(e))


async def _cron_job_cleanup() -> None:
    try:
        from app.services.download_service import _jobs
        if len(_jobs) > 100:
            sorted_ids = sorted(
                _jobs.keys(),
                key=lambda jid: _jobs[jid].get("createdAt", ""),
                reverse=True,
            )
            for jid in sorted_ids[100:]:
                _jobs.pop(jid, None)
        log.info("cron.job_cleanup.done", remaining=len(_jobs))
    except Exception as e:
        log.error("cron.job_cleanup.failed", error=str(e))


# ── App + Socket.IO ───────────────────────────────────────────

sio = socketio.AsyncServer(
    async_mode="asgi",
    # BUG #20: Use the explicit CORS allow-list instead of wildcard.
    # Socket.IO accepts a list[str] for allowed origins.
    cors_allowed_origins=_ALLOWED_ORIGINS,
    logger=False,
    engineio_logger=False,
    # BUG #19: Configure built-in Socket.IO ping interval
    ping_interval=25,
    ping_timeout=10,
)

app = FastAPI(
    title="Shulker API",
    version=VERSION,
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)

socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

ws_manager.init(sio)
register_events(sio)


# ── Lifespan ──────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(_app: FastAPI):
    log.info("shulker.api.starting", version=VERSION, env=settings.ENV)
    # BUG #22: Validate MUSIC_DIR existence — create if missing, warn if inaccessible
    music_path = Path(settings.MUSIC_DIR)
    if not music_path.exists():
        try:
            music_path.mkdir(parents=True, exist_ok=True)
            log.info("lifespan.music_dir.created", path=str(music_path))
        except OSError as e:
            log.error("lifespan.music_dir.unusable", path=str(music_path), error=str(e))
    else:
        if not os.access(str(music_path), os.R_OK | os.W_OK):
            log.warning("lifespan.music_dir.no_access", path=str(music_path))
    Path(settings.DOWNLOADS_DIR).mkdir(parents=True, exist_ok=True)

    # BUG #12: Clean stale stream failure cache entries on startup
    from app.routers.stream_router import _failure_cache
    _failure_cache.clear()

    scheduler.add_job(_cron_keep_alive,    "interval", minutes=14, id="keep_alive",   replace_existing=True)
    scheduler.add_job(_cron_library_scan,  "interval", minutes=30, id="library_scan", replace_existing=True)
    scheduler.add_job(_cron_ytdlp_update,  "cron", hour=3,         id="ytdlp_update", replace_existing=True)
    scheduler.add_job(_cron_job_cleanup,   "interval", hours=6,    id="job_cleanup",  replace_existing=True)
    scheduler.start()

    log.info("shulker.api.ready", cron_jobs=[j.id for j in scheduler.get_jobs()])
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
app.add_exception_handler(Exception,        generic_exception_handler)


# ── Routers ───────────────────────────────────────────────────

app.include_router(search.router,          prefix="/api/search",    tags=["search"])
app.include_router(tracks.router,          prefix="/api/tracks",    tags=["tracks"])
app.include_router(downloads.router,       prefix="/api/downloads", tags=["downloads"])
app.include_router(stream.router,          prefix="/api/stream",    tags=["stream"])
app.include_router(lyrics.router,          prefix="/api/lyrics",    tags=["lyrics"])
app.include_router(playlists.router,       prefix="/api/playlists", tags=["playlists"])
app.include_router(settings_router.router, prefix="/api/settings",  tags=["settings"])


# ── Root — NO redirect ────────────────────────────────────────
# Previously returned RedirectResponse("/api/docs") which caused a 307
# redirect loop on Render. Render's health check hits GET / — a redirect
# response made the router chain: / → 307 → /api/docs → 200, but some
# clients and Render's own proxy re-issue the GET causing repeated 307s.
# Returning 200 JSON directly stops the loop.

@app.get("/", include_in_schema=False)
async def root():
    return JSONResponse({
        "name":    "Shulker API",
        "version": VERSION,
        "docs":    "/api/docs",
        "health":  "/api/health",
    })


# ── Health ────────────────────────────────────────────────────

def _ytdlp_version() -> str:
    try:
        import importlib.metadata
        return importlib.metadata.version("yt-dlp")
    except Exception:
        return "unknown"


def _disk_info(path: str) -> dict:
    try:
        u = shutil.disk_usage(path)
        return {
            "total_gb": round(u.total / 1e9, 2),
            "used_gb":  round(u.used  / 1e9, 2),
            "free_gb":  round(u.free  / 1e9, 2),
            "used_pct": round(u.used  / u.total * 100, 1),
        }
    except Exception:
        return {}


def _memory_info() -> dict:
    try:
        import resource
        u = resource.getrusage(resource.RUSAGE_SELF)
        return {"rss_mb": round(u.ru_maxrss / 1024, 1)}
    except Exception:
        return {}


def _count_local_files() -> dict:
    counts: dict[str, int] = {}
    total = 0
    for d in settings.all_music_dirs:
        base = Path(d)
        if not base.exists():
            continue
        n = sum(1 for p in base.rglob("*") if p.suffix.lstrip(".") in AUDIO_EXTS)
        counts[d] = n
        total += n
    return {"total": total, "by_dir": counts}


async def _active_downloads() -> dict:
    try:
        from app.services.download_service import _jobs
        statuses: dict[str, int] = {}
        for job in _jobs.values():
            s = job.get("status", "unknown")
            statuses[s] = statuses.get(s, 0) + 1
        return {"total": len(_jobs), "by_status": statuses}
    except Exception:
        return {"total": 0, "by_status": {}}


@app.get("/api/health", tags=["health"])
async def health():
    uptime_s  = round(time.monotonic() - _START_TIME)
    uptime_hr = uptime_s // 3600
    uptime_mn = (uptime_s % 3600) // 60
    uptime_sc = uptime_s % 60
    downloads = await _active_downloads()

    return JSONResponse({
        "status":    "ok",
        "version":   VERSION,
        "env":       settings.ENV,
        "uptime":    f"{uptime_hr:02d}:{uptime_mn:02d}:{uptime_sc:02d}",
        "uptime_s":  uptime_s,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "python":    __import__("sys").version.split()[0],
        "ytdlp":     _ytdlp_version(),
        "memory":    _memory_info(),
        "music_dir":     settings.MUSIC_DIR,
        "downloads_dir": settings.DOWNLOADS_DIR,
        "extra_dirs":    settings.all_music_dirs,
        "disk":          _disk_info(settings.MUSIC_DIR),
        "local_files":   _count_local_files(),
        "spotify": {
            "connected": settings.has_spotify,
            "client_id": (settings.SPOTIFY_CLIENT_ID[:8] + "…") if settings.has_spotify else None,
        },
        "downloads":      downloads,
        "keep_alive":     _keep_alive_stats,
        "allowed_origins": _ALLOWED_ORIGINS,
        "cron_jobs": [
            {
                "id":       j.id,
                "next_run": j.next_run_time.isoformat() if j.next_run_time else None,
            }
            for j in scheduler.get_jobs()
        ],
    })


# ── Library aggregates ────────────────────────────────────────

@app.get("/api/library/featured", tags=["library"])
async def library_featured(limit: int = Query(10, ge=1, le=50)):
    from app.routers.playlist_router import _load
    data = list(_load().values())[:limit]
    return [
        {
            "id":         pl["id"],
            "title":      pl["title"],
            "subtitle":   f"{pl.get('trackCount', len(pl.get('tracks', [])))} songs",
            "artworkUrl": pl.get("artworkUrl"),
            "type":       "playlist",
        }
        for pl in data
    ]


@app.get("/api/library/albums", tags=["library"])
async def library_albums():
    from app.routers.track_router import _build_index
    idx  = await _build_index()
    seen: dict[str, dict] = {}
    for t in idx.values():
        key = t.get("album", {}).get("title") or ""
        if not key or key in seen:
            continue
        seen[key] = {
            "id":          t["album"].get("id") or key,
            "title":       t["album"]["title"],
            "artworkUrl":  t.get("artworkUrl"),
            "releaseYear": t["album"].get("releaseYear", 0),
            "trackCount":  sum(
                1 for x in idx.values()
                if x.get("album", {}).get("title") == key
            ),
            "artist": t["album"].get("artist", {}),
        }
    return list(seen.values())


@app.get("/api/library/artists", tags=["library"])
async def library_artists():
    from app.routers.track_router import _build_index
    idx  = await _build_index()
    seen: dict[str, dict] = {}
    for t in idx.values():
        artist = t.get("artist", {})
        aid    = artist.get("id") or artist.get("name") or ""
        if not aid or aid in seen:
            continue
        seen[aid] = {
            "id":         aid,
            "name":       artist.get("name", ""),
            "imageUrl":   artist.get("imageUrl", ""),
            "trackCount": sum(
                1 for x in idx.values()
                if (x.get("artist", {}).get("id") or x.get("artist", {}).get("name")) == aid
            ),
        }
    return list(seen.values())