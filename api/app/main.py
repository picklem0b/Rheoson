from contextlib import asynccontextmanager
from pathlib import Path

import socketio
import structlog
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from app.core.config import settings
from app.core.logging import configure_logging
from app.core.exceptions import (
    ShulkerException,
    shulker_exception_handler,
    generic_exception_handler,
)
from app.websocket.manager import ws_manager
from app.websocket.events import register_events
from app.routers import (
    search,
    tracks,
    downloads,
    stream,
    lyrics,
    playlists,
    settings as settings_router,
)

configure_logging()
log = structlog.get_logger()


# ── Socket.IO ─────────────────────────────────────────────────
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    logger=False,
    engineio_logger=False,
)

ws_manager.init(sio)
register_events(sio)


# ── Lifespan ──────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("shulker.api.starting", env=settings.ENV, port=settings.API_PORT)
    Path(settings.MUSIC_DIR).mkdir(parents=True, exist_ok=True)
    Path(settings.DOWNLOADS_DIR).mkdir(parents=True, exist_ok=True)
    log.info(
        "shulker.api.ready",
        music_dir=settings.MUSIC_DIR,
        downloads_dir=settings.DOWNLOADS_DIR,
        extra_dirs=settings.EXTRA_MUSIC_DIRS,
    )
    yield
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
    allow_origins=["*"],
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
    })


# ── Library endpoints ─────────────────────────────────────────
# These were missing entirely — Home page was 404ing on /library/featured.
# Kept here in main.py for now; can be moved to a library router later.

AUDIO_EXTS = {"mp3", "flac", "m4a", "ogg", "opus", "wav"}


@app.get("/api/library/featured", tags=["library"])
async def library_featured(limit: int = Query(10, ge=1, le=50)):
    """
    Featured playlists for the Home page hero carousel.
    Returns user's local playlists immediately — no external API call.
    Falls back to empty list if none exist yet.
    """
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
    """Albums derived from local music library scan."""
    from app.services.metadata_service import read_track_metadata
    seen: dict[str, dict] = {}
    music_dir = Path(settings.MUSIC_DIR)
    if not music_dir.exists():
        return []
    for path in music_dir.rglob("*"):
        if path.suffix.lstrip(".") in AUDIO_EXTS:
            try:
                t         = read_track_metadata(path)
                album_key = t["album"]["title"] or ""
                if not album_key:
                    continue
                if album_key not in seen:
                    seen[album_key] = {
                        "id":          t["album"]["id"] or album_key,
                        "title":       t["album"]["title"],
                        "artworkUrl":  t.get("artworkUrl"),
                        "releaseYear": t["album"].get("releaseYear", 0),
                        "trackCount":  0,
                        "artist":      t["artist"],
                    }
                seen[album_key]["trackCount"] += 1
            except Exception:
                continue
    return list(seen.values())


@app.get("/api/library/artists", tags=["library"])
async def library_artists():
    """Artists derived from local music library scan."""
    from app.services.metadata_service import read_track_metadata
    seen: dict[str, dict] = {}
    music_dir = Path(settings.MUSIC_DIR)
    if not music_dir.exists():
        return []
    for path in music_dir.rglob("*"):
        if path.suffix.lstrip(".") in AUDIO_EXTS:
            try:
                t    = read_track_metadata(path)
                name = t["artist"]["name"] or ""
                if not name:
                    continue
                if name not in seen:
                    seen[name] = {
                        "id":       t["artist"]["id"] or name,
                        "name":     name,
                        "imageUrl": t["artist"].get("imageUrl"),
                        "genres":   [],
                    }
            except Exception:
                continue
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
# Must be LAST — wraps the FastAPI app
socket_app = socketio.ASGIApp(
    socketio_server=sio,
    other_asgi_app=app,
    socketio_path="socket.io",
)