from contextlib import asynccontextmanager
from pathlib import Path

import socketio
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.logging import configure_logging
from app.core.exceptions import (
    ShulkerException,
    shulker_exception_handler,
    generic_exception_handler,
)
from app.websocket.manager import ws_manager
from app.websocket.events import register_events
from app.routers import search, tracks, downloads, stream, lyrics, playlists

configure_logging()
log = structlog.get_logger()


# ── Socket.IO ─────────────────────────────────────────────────
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=settings.CORS_ORIGINS,
    logger=False,
    engineio_logger=False,
)

# Inject sio into the ws_manager singleton so services can emit
ws_manager.init(sio)

# Register connect/disconnect/ping handlers
register_events(sio)


# ── Lifespan ──────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("shulker.api.starting", env=settings.ENV, port=settings.API_PORT)

    # Ensure dirs exist
    Path(settings.MUSIC_DIR).mkdir(parents=True, exist_ok=True)
    Path(settings.DOWNLOADS_DIR).mkdir(parents=True, exist_ok=True)

    log.info("shulker.api.ready",
             music_dir=settings.MUSIC_DIR,
             downloads_dir=settings.DOWNLOADS_DIR)
    yield
    log.info("shulker.api.shutdown")


# ── FastAPI ───────────────────────────────────────────────────
app = FastAPI(
    title="Shulker API",
    version="1.0.0-alpha",
    lifespan=lifespan,
    docs_url="/api/docs" if settings.is_dev else None,
    redoc_url=None,
)

from fastapi.responses import JSONResponse

@app.get("/api/health", tags=["health"])
async def health():
    return JSONResponse({
        "status":        "ok",
        "version":       "1.0.0-alpha",
        "env":           settings.ENV,
        "music_dir":     settings.MUSIC_DIR,
        "downloads_dir": settings.DOWNLOADS_DIR,
    })

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Exception handlers ────────────────────────────────────────
app.add_exception_handler(ShulkerException, shulker_exception_handler)
app.add_exception_handler(Exception,        generic_exception_handler)

# ── Routers ───────────────────────────────────────────────────
app.include_router(search.router,    prefix="/api/search",    tags=["search"])
app.include_router(tracks.router,    prefix="/api/tracks",    tags=["tracks"])
app.include_router(downloads.router, prefix="/api/downloads", tags=["downloads"])
app.include_router(stream.router,    prefix="/api/stream",    tags=["stream"])
app.include_router(lyrics.router,    prefix="/api/lyrics",    tags=["lyrics"])
app.include_router(playlists.router, prefix="/api/playlists", tags=["playlists"])

# ── Mount Socket.IO ───────────────────────────────────────────
# Wraps the FastAPI app — Socket.IO handles WS, FastAPI handles HTTP
socket_app = socketio.ASGIApp(
    socketio_server=sio,
    other_asgi_app=app,
    socketio_path="socket.io",
)