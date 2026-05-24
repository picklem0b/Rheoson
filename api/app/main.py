from contextlib import asynccontextmanager
from pathlib import Path

import socketio
import structlog
from fastapi import FastAPI
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

    # Ensure required directories exist
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
    version="1.2.0",
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
        "version":       "1.2.0",
        "env":           settings.ENV,
        "music_dir":     settings.MUSIC_DIR,
        "downloads_dir": settings.DOWNLOADS_DIR,
        "extra_dirs":    settings.all_music_dirs,
        "spotify":       settings.has_spotify,
    })


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