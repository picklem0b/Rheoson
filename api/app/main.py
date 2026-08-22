from __future__ import annotations
import asyncio
import json
import os
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
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse, RedirectResponse, HTMLResponse

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

VERSION    = "2.3.0"
_START_TIME = time.monotonic()

AUDIO_EXTS = {"mp3", "flac", "m4a", "ogg", "opus", "wav"}


# ── OpenAPI metadata ──────────────────────────────────────────

_DESCRIPTION = """
## Shulker API

Self-hosted music streaming, downloading, and library management.
No subscription. No ads. No compromise.

### What this API does

- **Search** — Full-text search across YouTube Music (tracks, albums, artists, playlists).
  Paste any Spotify, YouTube, SoundCloud, or Bandcamp URL and it resolves automatically.
- **Stream** — Audio starts in 1–3 seconds. Local downloads are served from disk with
  full HTTP range support. Remote tracks are piped from yt-dlp with no intermediate file.
- **Download** — Submit a job. yt-dlp fetches the best quality stream, ffmpeg converts
  to your chosen format (MP3/FLAC/Opus/M4A/WAV), mutagen embeds artwork, lyrics,
  and full metadata. Progress is emitted over Socket.IO in real time.
- **Library** — Local files are indexed from all configured music directories.
  Like, play history, playlists. Import Spotify playlists by URL.
- **Lyrics** — Synced LRC lyrics fetched and served per track.
- **Settings** — Configure music directories, Spotify credentials, rescan the library.

### Authentication

No authentication. This is a single-user, self-hosted application.
The API is designed to run on your own device (Termux) or your own server (Render).

### Real-time events (Socket.IO)

Connect to the server origin on `/socket.io`. Events emitted by the server:

| Event | Payload | When |
|---|---|---|
| `download:progress` | `{id, progress, status, title}` | During download |
| `download:done` | `{id, filePath, title}` | Download complete |
| `download:error` | `{id, error, title}` | Download failed |

### Rate limits

None. You are the only user.

### Source code

[github.com/picklem0b/shulker](https://github.com/picklem0b/shulker)
"""

_TAGS_METADATA = [
    {
        "name":        "health",
        "description": "Service status, uptime, disk usage, memory, yt-dlp version, "
                       "cron job schedule, and keep-alive ping stats.",
    },
    {
        "name":        "search",
        "description": "Search YouTube Music for tracks, albums, artists, and playlists. "
                       "Resolve external URLs (Spotify, YouTube, SoundCloud, Bandcamp) "
                       "into a streamable track. Get autocomplete suggestions.",
    },
    {
        "name":        "tracks",
        "description": "Access the local track library (downloaded files). "
                       "Like/unlike tracks, record play history, get trending, "
                       "view recently played.",
    },
    {
        "name":        "stream",
        "description": "Stream audio and fetch artwork. "
                       "Supports HTTP range requests for instant scrubbing on downloaded files. "
                       "Remote tracks are piped from yt-dlp with retry logic across 3 client variants. "
                       "The artwork-proxy endpoint serves remote images server-side "
                       "to avoid CORS issues on the APK.",
    },
    {
        "name":        "downloads",
        "description": "Manage download jobs. Submit a track ID or URL, "
                       "poll progress, cancel or retry failed jobs. "
                       "Real-time progress is also available over Socket.IO.",
    },
    {
        "name":        "lyrics",
        "description": "Fetch synced (LRC) or plain lyrics for a track. "
                       "Sources: embedded file tags → Spotify API → web scrape fallback.",
    },
    {
        "name":        "playlists",
        "description": "Create and manage local playlists. "
                       "Import any Spotify playlist by URL — resolves each track "
                       "against YouTube Music.",
    },
    {
        "name":        "settings",
        "description": "Configure music directories, Spotify credentials, "
                       "and trigger library rescans. "
                       "Browse a directory to preview audio files before adding it.",
    },
    {
        "name":        "library",
        "description": "Aggregate views over the local library — featured playlists, "
                       "all albums, and all artists derived from indexed track metadata.",
    },
]


# ── CORS ──────────────────────────────────────────────────────

_BUILTIN_ORIGINS = [
    "https://shulker-web.onrender.com",
    "https://shulker-api-vnny.onrender.com",
    "https://shulker.onrender.com",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:8000",
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
    url = "https://shulker-api-vnny.onrender.com/api/health"
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
        from app.routers.stream_router import invalidate_stream_cache
        invalidate_track_index()
        invalidate_stream_cache()
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


# ── App ───────────────────────────────────────────────────────

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    logger=False,
    engineio_logger=False,
)

app = FastAPI(
    title="Shulker API",
    version=VERSION,
    description=_DESCRIPTION,
    openapi_tags=_TAGS_METADATA,
    contact={
        "name":  "LethaboK",
        "url":   "https://github.com/picklem0b",
    },
    license_info={
        "name": "MIT",
        "url":  "https://github.com/picklem0b/shulker/blob/main/LICENSE",
    },
    # Disable FastAPI's default docs so we can serve our own styled version
    docs_url=None,
    redoc_url=None,
    openapi_url="/api/openapi.json",
    servers=[
        {
            "url":         "https://shulker-api-vnny.onrender.com",
            "description": "Production (Render)",
        },
        {
            "url":         "http://127.0.0.1:8000",
            "description": "Local / Termux",
        },
    ],
)

socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

ws_manager.init(sio)
register_events(sio)


# ── Lifespan ──────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(_app: FastAPI):
    log.info("shulker.api.starting", version=VERSION, env=settings.ENV)
    Path(settings.MUSIC_DIR).mkdir(parents=True, exist_ok=True)
    Path(settings.DOWNLOADS_DIR).mkdir(parents=True, exist_ok=True)

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


# ── Custom Swagger UI ─────────────────────────────────────────
# Serves a dark-themed Swagger UI that matches the Shulker design system.

@app.get("/api/docs", include_in_schema=False)
async def swagger_ui():
    return HTMLResponse(f"""<!DOCTYPE html>
<html>
<head>
  <title>Shulker API — v{VERSION}</title>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="https://raw.githubusercontent.com/picklem0b/shulker/main/web/public/assets/logo.png"/>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  <style>
    *, *::before, *::after {{ box-sizing: border-box; }}
    body  {{ margin: 0; background: #0a0a0a; }}

    .swagger-ui {{ font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }}

    /* Top bar */
    .swagger-ui .topbar         {{ background: #111111; border-bottom: 1px solid #222; padding: 10px 0; }}
    .swagger-ui .topbar-wrapper {{ gap: 12px; }}
    .swagger-ui .topbar a       {{ font-size: 1.1rem; font-weight: 800; color: #f5f5f5; }}

    /* Main background */
    .swagger-ui .wrapper,
    .swagger-ui .information-container {{ background: #0a0a0a; }}

    /* Description */
    .swagger-ui .info          {{ margin: 30px 0 20px; }}
    .swagger-ui .info .title   {{ color: #f5f5f5; font-size: 2rem; font-weight: 800; }}
    .swagger-ui .info p,
    .swagger-ui .info li,
    .swagger-ui .info td       {{ color: #a3a3a3; }}
    .swagger-ui .info a        {{ color: #8B5CF6; }}
    .swagger-ui .info table    {{ border-collapse: collapse; width: 100%; margin: 12px 0; }}
    .swagger-ui .info th       {{ color: #f5f5f5; font-weight: 700; border-bottom: 1px solid #333; padding: 6px 8px; text-align: left; }}
    .swagger-ui .info td       {{ padding: 5px 8px; border-bottom: 1px solid #1f1f1f; font-family: monospace; font-size: 0.85rem; }}
    .swagger-ui .info code     {{ background: #1a1a1a; color: #a5d6ff; padding: 2px 6px; border-radius: 4px; }}

    /* Tag headers */
    .swagger-ui .opblock-tag       {{ border-bottom: 1px solid #1f1f1f; color: #f5f5f5; font-weight: 700; font-size: 1rem; }}
    .swagger-ui .opblock-tag:hover {{ background: #111; }}
    .swagger-ui .opblock-tag small {{ color: #737373; font-weight: 400; }}

    /* Operation blocks */
    .swagger-ui .opblock               {{ background: #111; border: 1px solid #222; border-radius: 12px; margin-bottom: 6px; }}
    .swagger-ui .opblock .opblock-summary {{ border-radius: 12px; }}
    .swagger-ui .opblock-summary-description {{ color: #a3a3a3; font-size: 0.875rem; }}
    .swagger-ui .opblock-summary-path  {{ color: #f5f5f5; font-weight: 600; }}

    /* Method colours */
    .swagger-ui .opblock.opblock-get    {{ border-color: #1d4ed8; background: rgba(29,78,216,0.05); }}
    .swagger-ui .opblock.opblock-post   {{ border-color: #15803d; background: rgba(21,128,61,0.05); }}
    .swagger-ui .opblock.opblock-delete {{ border-color: #b91c1c; background: rgba(185,28,28,0.05); }}
    .swagger-ui .opblock.opblock-put    {{ border-color: #b45309; background: rgba(180,83,9,0.05); }}
    .swagger-ui .opblock.opblock-head   {{ border-color: #6d28d9; background: rgba(109,40,217,0.05); }}

    .swagger-ui .opblock-get    .opblock-summary-method {{ background: #1d4ed8; border-radius: 6px; }}
    .swagger-ui .opblock-post   .opblock-summary-method {{ background: #15803d; border-radius: 6px; }}
    .swagger-ui .opblock-delete .opblock-summary-method {{ background: #b91c1c; border-radius: 6px; }}
    .swagger-ui .opblock-put    .opblock-summary-method {{ background: #b45309; border-radius: 6px; }}
    .swagger-ui .opblock-head   .opblock-summary-method {{ background: #6d28d9; border-radius: 6px; }}

    /* Expanded body */
    .swagger-ui .opblock-body,
    .swagger-ui .opblock-description-wrapper {{ background: #0f0f0f; }}
    .swagger-ui .opblock-section-header      {{ background: #141414; border-bottom: 1px solid #222; }}
    .swagger-ui .opblock-section-header h4   {{ color: #f5f5f5; font-weight: 700; }}
    .swagger-ui .parameter__name  {{ color: #f5f5f5; }}
    .swagger-ui .parameter__type  {{ color: #8B5CF6; }}
    .swagger-ui table.parameters   {{ background: #0f0f0f; }}
    .swagger-ui .parameters-col_description p {{ color: #a3a3a3; }}

    /* Models / schemas */
    .swagger-ui section.models                   {{ background: #111; border: 1px solid #222; border-radius: 12px; }}
    .swagger-ui section.models h4                {{ color: #f5f5f5; }}
    .swagger-ui .model-box                       {{ background: #0f0f0f; }}
    .swagger-ui .model-title                     {{ color: #8B5CF6; }}
    .swagger-ui .model span                      {{ color: #a3a3a3; }}
    .swagger-ui .prop-type                       {{ color: #8B5CF6; }}
    .swagger-ui .prop-format                     {{ color: #737373; }}

    /* Response section */
    .swagger-ui .response-col_status  {{ color: #f5f5f5; font-weight: 700; }}
    .swagger-ui .response-col_links   {{ color: #737373; }}
    .swagger-ui .response             {{ background: #0f0f0f; }}
    .swagger-ui .responses-inner      {{ background: #0f0f0f; }}
    .swagger-ui .highlight-code       {{ background: #141414 !important; }}
    .swagger-ui .microlight           {{ background: #141414; color: #a5d6ff; padding: 12px; border-radius: 8px; }}

    /* Execute button */
    .swagger-ui .btn.execute   {{ background: #8B5CF6; border-color: #8B5CF6; border-radius: 8px; font-weight: 700; }}
    .swagger-ui .btn.execute:hover {{ background: #7c3aed; }}
    .swagger-ui .btn           {{ border-radius: 8px; }}
    .swagger-ui .btn.cancel    {{ border-color: #333; color: #a3a3a3; }}
    .swagger-ui .btn.authorize {{ background: transparent; border-color: #8B5CF6; color: #8B5CF6; border-radius: 8px; font-weight: 700; }}

    /* Inputs */
    .swagger-ui input[type=text],
    .swagger-ui textarea,
    .swagger-ui select         {{ background: #1a1a1a; border: 1px solid #333; color: #f5f5f5; border-radius: 8px; }}
    .swagger-ui input[type=text]:focus,
    .swagger-ui textarea:focus {{ border-color: #8B5CF6; outline: none; }}

    /* Server selector */
    .swagger-ui .servers > label select {{ background: #1a1a1a; color: #f5f5f5; border: 1px solid #333; border-radius: 8px; padding: 6px 8px; }}
    .swagger-ui .servers > label        {{ color: #a3a3a3; font-size: 0.875rem; }}

    /* Scheme badge (OAS 3.1) */
    .swagger-ui .scheme-container {{ background: #111; border-bottom: 1px solid #222; padding: 12px 0; }}
    .swagger-ui .scheme-container .schemes > label {{ color: #a3a3a3; }}

    /* Scrollbar */
    ::-webkit-scrollbar        {{ width: 6px; height: 6px; }}
    ::-webkit-scrollbar-track  {{ background: #0a0a0a; }}
    ::-webkit-scrollbar-thumb  {{ background: #333; border-radius: 3px; }}
    ::-webkit-scrollbar-thumb:hover {{ background: #555; }}
  </style>
</head>
<body>
<div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>
  SwaggerUIBundle({{
    url:                       "/api/openapi.json",
    dom_id:                    "#swagger-ui",
    presets:                   [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
    layout:                    "BaseLayout",
    deepLinking:               true,
    displayRequestDuration:    true,
    defaultModelsExpandDepth:  1,
    defaultModelExpandDepth:   2,
    filter:                    true,
    tryItOutEnabled:           false,
    syntaxHighlight:           {{ activated: true, theme: "agate" }},
  }});
</script>
</body>
</html>""")


# ── Root ──────────────────────────────────────────────────────

@app.get("/", include_in_schema=False)
async def root():
    return RedirectResponse("/api/docs")


# ── Health ────────────────────────────────────────────────────

def _ytdlp_version() -> str:
    try:
        import importlib.metadata
        return importlib.metadata.version("yt-dlp")
    except Exception:
        return "unknown"


def _disk_info(path: str) -> dict:
    try:
        usage = shutil.disk_usage(path)
        return {
            "total_gb":  round(usage.total / 1e9, 2),
            "used_gb":   round(usage.used  / 1e9, 2),
            "free_gb":   round(usage.free  / 1e9, 2),
            "used_pct":  round(usage.used  / usage.total * 100, 1),
        }
    except Exception:
        return {}


def _memory_info() -> dict:
    try:
        import resource
        usage = resource.getrusage(resource.RUSAGE_SELF)
        return {"rss_mb": round(usage.ru_maxrss / 1024, 1)}
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


@app.get(
    "/api/health",
    tags=["health"],
    summary="Service health check",
    response_description="Full status snapshot including uptime, disk, memory, downloads, keep-alive ping stats, and cron schedule.",
)
async def health():
    """
    Returns a comprehensive status snapshot of the running Shulker API.

    **Fields:**

    - `status` — always `"ok"` if the server is up
    - `version` — API version string
    - `uptime` — formatted as `HH:MM:SS` since process start
    - `python` — Python runtime version
    - `ytdlp` — installed yt-dlp version
    - `memory.rss_mb` — resident set size in megabytes
    - `disk` — total/used/free in GB and used percentage for the music directory
    - `local_files.total` — number of audio files indexed across all active directories
    - `spotify.connected` — whether Spotify credentials are configured
    - `downloads` — total jobs and count per status (`queued`, `downloading`, `done`, `error`)
    - `keep_alive` — last ping timestamp, HTTP status, latency, and failure count
    - `cron_jobs` — each scheduled job and its next run time
    - `allowed_origins` — the full CORS allow list currently in effect
    """
    uptime_s  = round(time.monotonic() - _START_TIME)
    uptime_hr = uptime_s // 3600
    uptime_mn = (uptime_s % 3600) // 60
    uptime_sc = uptime_s % 60
    downloads = await _active_downloads()

    return JSONResponse({
        # ── Core ──────────────────────────────────────────────
        "status":   "ok",
        "version":  VERSION,
        "env":      settings.ENV,
        "uptime":   f"{uptime_hr:02d}:{uptime_mn:02d}:{uptime_sc:02d}",
        "uptime_s": uptime_s,
        "timestamp": datetime.now(timezone.utc).isoformat(),

        # ── Runtime ───────────────────────────────────────────
        "python":    __import__("sys").version.split()[0],
        "ytdlp":     _ytdlp_version(),
        "memory":    _memory_info(),

        # ── Storage ───────────────────────────────────────────
        "music_dir":     settings.MUSIC_DIR,
        "downloads_dir": settings.DOWNLOADS_DIR,
        "extra_dirs":    settings.all_music_dirs,
        "disk":          _disk_info(settings.MUSIC_DIR),
        "local_files":   _count_local_files(),

        # ── Features ──────────────────────────────────────────
        "spotify": {
            "connected": settings.has_spotify,
            "client_id": (settings.SPOTIFY_CLIENT_ID[:8] + "…")
                         if settings.has_spotify else None,
        },

        # ── Downloads ─────────────────────────────────────────
        "downloads": downloads,

        # ── Keep-alive ────────────────────────────────────────
        "keep_alive": _keep_alive_stats,

        # ── CORS ──────────────────────────────────────────────
        "allowed_origins": _ALLOWED_ORIGINS,

        # ── Cron jobs ─────────────────────────────────────────
        "cron_jobs": [
            {
                "id":       j.id,
                "next_run": j.next_run_time.isoformat()
                            if j.next_run_time else None,
            }
            for j in scheduler.get_jobs()
        ],
    })

# ── Library ───────────────────────────────────────────────────

@app.get(
    "/api/library/featured",
    tags=["library"],
    summary="Featured playlists",
    response_description="Up to `limit` playlists from the local library.",
)
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


@app.get(
    "/api/library/albums",
    tags=["library"],
    summary="All albums in the local library",
    response_description="Deduplicated album list derived from downloaded track metadata.",
)
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


@app.get(
    "/api/library/artists",
    tags=["library"],
    summary="All artists in the local library",
    response_description="Deduplicated artist list derived from downloaded track metadata.",
)
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