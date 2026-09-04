from __future__ import annotations
import asyncio
import os
import json
import re
import shutil
import time
import uuid
import structlog

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

import httpx
import socketio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings, validate_startup
from app.core.logging_config import configure_logging
from app.core.database import connect_db, close_db, db_available
from app.core.exceptions import (
    RheosonException,
    Rheoson_exception_handler,
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
    auth_router,
    recommendation_router,
)
from app.routers import equalizer_router, share_router, analytics_router, smart_playlist_router, clerk_webhook_router

configure_logging()
log = structlog.get_logger()

# ── Startup validation ────────────────────────────────────────
validate_startup()

VERSION     = "2.11.0"
_START_TIME = time.monotonic()

AUDIO_EXTS = {"mp3", "flac", "m4a", "ogg", "opus", "wav"}

# ── CORS ──────────────────────────────────────────────────────

_BUILTIN_ORIGINS = [
    "https://Rheoson-web.onrender.com",
    "https://Rheoson-api-vnny.onrender.com",
    "https://Rheoson.onrender.com",
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
    """Ping the API to prevent Render free tier from sleeping.

    Only runs in production (on Render). In dev, the server is always
    running locally — no need to self-ping.
    """
    # Skip keep-alive in development — pinging localhost is pointless
    if settings.is_dev:
        return

    url = settings.RENDER_API_URL or "https://Rheoson-api-vnny.onrender.com"
    health_url = f"{url}/api/health"
    t0 = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(health_url)
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
        now = time.monotonic()
        stale = [k for k, exp in _failure_cache.items() if exp <= now]
        for k in stale:
            _failure_cache.pop(k, None)
        if stale:
            log.info("cron.failure_cache.cleaned", count=len(stale))
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
    cors_allowed_origins=_ALLOWED_ORIGINS,
    logger=False,
    engineio_logger=False,
    ping_interval=25,
    ping_timeout=10,
)

app = FastAPI(
    title="Rheoson API",
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
    log.info("Rheoson.api.starting", version=VERSION, env=settings.ENV, has_clerk=settings.has_clerk, has_redis=settings.has_redis)
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

    from app.routers.stream_router import _failure_cache
    _failure_cache.clear()

    scheduler.add_job(_cron_keep_alive,    "interval", minutes=14, id="keep_alive",   replace_existing=True)
    scheduler.add_job(_cron_library_scan,  "interval", minutes=30, id="library_scan", replace_existing=True)
    scheduler.add_job(_cron_ytdlp_update,  "cron", hour=3,         id="ytdlp_update", replace_existing=True)
    scheduler.add_job(_cron_job_cleanup,   "interval", hours=6,    id="job_cleanup",  replace_existing=True)
    await connect_db()
    scheduler.start()

    log.info("Rheoson.api.ready", cron_jobs=[j.id for j in scheduler.get_jobs()])
    yield
    scheduler.shutdown(wait=False)
    await close_db()
    log.info("Rheoson.api.stopped")

app.router.lifespan_context = lifespan


# ── Middleware ────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Content-Length", "X-Cache"],
)

# ── Middleware imports ────────────────────────────────────────
import collections
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest
from starlette.responses import JSONResponse as _RateJSON


# ── Request ID middleware ─────────────────────────────────────
class RequestIDMiddleware(BaseHTTPMiddleware):
    """Attach a unique request ID to every request/response for tracing."""
    async def dispatch(self, request: StarletteRequest, call_next):
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())[:8]
        structlog.contextvars.bind_contextvars(request_id=request_id)
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        structlog.contextvars.unbind_contextvars("request_id")
        return response

app.add_middleware(RequestIDMiddleware)


# ── Security headers middleware ───────────────────────────────
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        host = request.headers.get("host", "")
        if host and not host.startswith("localhost") and not host.startswith("127."):
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

app.add_middleware(SecurityHeadersMiddleware)


# ── Rate limiting middleware ──────────────────────────────────

class RateLimitMiddleware(BaseHTTPMiddleware):
    """In-memory sliding-window rate limiter per IP.

    Falls back to this when Redis is not configured.
    For production with Redis, see the Redis-backed version.
    """

    def __init__(self, app, limits: dict[str, int]):
        super().__init__(app)
        self._limits = limits
        self._hits: dict[str, collections.deque] = {}

    async def dispatch(self, request: StarletteRequest, call_next):
        client_ip = request.client.host if request.client else "unknown"
        path = request.url.path

        limit = None
        for prefix, max_req in self._limits.items():
            if path.startswith(prefix):
                limit = max_req
                break

        if limit is None:
            return await call_next(request)

        parts = path.split('/')
        segment = parts[2] if len(parts) > 2 else 'root'
        key = f'{client_ip}:{segment}'
        now = time.monotonic()
        window = 60.0

        if key not in self._hits:
            self._hits[key] = collections.deque()

        dq = self._hits[key]
        while dq and dq[0] < now - window:
            dq.popleft()

        if len(dq) >= limit:
            retry_after = int(dq[0] + window - now) + 1
            return _RateJSON(
                status_code=429,
                content={"detail": "Too many requests. Try again later."},
                headers={"Retry-After": str(retry_after)},
            )

        dq.append(now)
        return await call_next(request)

app.add_middleware(RateLimitMiddleware, limits={
    "/api/search":    settings.RATE_LIMIT_SEARCH,
    "/api/downloads": settings.RATE_LIMIT_DOWNLOAD,
})

app.add_exception_handler(RheosonException, Rheoson_exception_handler)
app.add_exception_handler(Exception,        generic_exception_handler)


# ── Routers ───────────────────────────────────────────────────

app.include_router(search.router,          prefix="/api/search",    tags=["search"])
app.include_router(tracks.router,          prefix="/api/tracks",    tags=["tracks"])
app.include_router(downloads.router,       prefix="/api/downloads", tags=["downloads"])
app.include_router(stream.router,          prefix="/api/stream",    tags=["stream"])
app.include_router(lyrics.router,          prefix="/api/lyrics",    tags=["lyrics"])
app.include_router(playlists.router,       prefix="/api/playlists", tags=["playlists"])
app.include_router(settings_router.router, prefix="/api/settings",  tags=["settings"])
app.include_router(auth_router.router,      prefix="/api/auth",      tags=["auth"])
app.include_router(recommendation_router.router, prefix="/api/recommendations", tags=["recommendations"])
app.include_router(equalizer_router.router, prefix="/api/equalizer", tags=["equalizer"])
app.include_router(share_router.router, prefix="/api/share", tags=["share"])
app.include_router(analytics_router.router, prefix="/api/analytics", tags=["analytics"])
app.include_router(smart_playlist_router.router, prefix="/api/smart-playlists", tags=["smart-playlists"])
app.include_router(clerk_webhook_router.router, prefix="/api", tags=["webhooks"])


# ── Root ──────────────────────────────────────────────────────

@app.get("/", include_in_schema=False)
async def root():
    return JSONResponse({
        "name":    "Rheoson API",
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
        "services": {
            "mongodb":   db_available(),
            "clerk":     settings.has_clerk,
            "redis":     settings.has_redis,
            "spotify":   settings.has_spotify,
        },
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


@app.get("/api/version", tags=["version"])
async def version_info():
    return JSONResponse({
        "version":     VERSION,
        "name":        "Rheoson",
        "releaseDate": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
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


# ── Artist detail ─────────────────────────────────────────────
# Full artist profile + top songs. Tries the YouTube Music artist browse
# first (covers remote artists and the full-player creator tab), then
# falls back to aggregating local library files by artist id/name so
# downloaded artists keep a page even with no network.

def _artist_slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+\s*", "-", name.strip().lower()).strip("-")


@app.get("/api/artists/{artist_id}", tags=["artists"])
async def artist_detail(artist_id: str, name: str = Query("", description="Fallback match by artist name")):
    from fastapi import HTTPException as _HTTP

    # 1) YouTube Music browse (browse ids look like UCaBtyDC... or channel ids)
    if artist_id and artist_id != "unknown" and artist_id != "local":
        try:
            from app.services.ytmusic_service import get_artist_with_content
            data = await get_artist_with_content(artist_id)
            if data.get("name"):
                return data
        except Exception:
            pass  # fall through to the local aggregate below

    # 2) Local library aggregate — match by exact artist id, slugged name,
    #    or the explicit ?name= query the frontend sends for unknown ids.
    from app.routers.track_router import _build_index
    idx  = await _build_index()
    matches: list[dict] = []
    for t in idx.values():
        art    = t.get("artist") or {}
        aid    = art.get("id") or ""
        aname  = art.get("name") or ""
        if aid and aid == artist_id:
            matches.append(t)
        elif aname and (_artist_slug(aname) == artist_id or (name and aname.lower() == name.lower())):
            matches.append(t)
    if not matches:
        raise _HTTP(status_code=404, detail="Artist not found")

    first = matches[0].get("artist") or {}
    return {
        "id":               artist_id,
        "name":             first.get("name", ""),
        "imageUrl":         first.get("imageUrl", "") or matches[0].get("artworkUrl", ""),
        "genres":           first.get("genres", []),
        "description":      "",
        "subscribers":      "",
        "views":            "",
        "monthlyListeners": 0,
        "topTracks":        matches[:20],
        "albums":           [],
        "singles":          [],
        "related":          [],
    }
