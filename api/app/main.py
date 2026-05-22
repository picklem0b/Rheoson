from contextlib import asynccontextmanager

import socketio
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.logging import configure_logging
from app.routers import (
    downloads,
    lyrics,
    playlists,
    search,
    settings as settings_router,
    stream,
    tracks,
)

configure_logging()
log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("shulker.api.starting", env=settings.ENV)
    # make sure music dir exists on startup
    from pathlib import Path
    Path(settings.MUSIC_DIR).mkdir(parents=True, exist_ok=True)
    Path(settings.DOWNLOADS_DIR).mkdir(parents=True, exist_ok=True)
    yield
    log.info("shulker.api.shutdown")


# ── Socket.IO ────────────────────────────────────────────────────────────────
# cors_allowed_origins must match vite dev server exactly
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ],
    logger=False,
    engineio_logger=False,
)


@sio.event
async def connect(sid, environ):
    log.info("ws.connect", sid=sid)


@sio.event
async def disconnect(sid):
    log.info("ws.disconnect", sid=sid)


# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="Shulker API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tracks.router,          prefix="/api/v1/tracks",    tags=["tracks"])
app.include_router(playlists.router,       prefix="/api/v1/playlists", tags=["playlists"])
app.include_router(downloads.router,       prefix="/api/v1/downloads", tags=["downloads"])
app.include_router(stream.router,          prefix="/api/v1/stream",    tags=["stream"])
app.include_router(search.router,          prefix="/api/v1/search",    tags=["search"])
app.include_router(lyrics.router,          prefix="/api/v1/lyrics",    tags=["lyrics"])
app.include_router(settings_router.router, prefix="/api/v1/settings",  tags=["settings"])

# ── Mount Socket.IO AFTER all HTTP routes ────────────────────────────────────
# This is the correct way — wrap the FastAPI app, don't mount as sub-app
socket_app = socketio.ASGIApp(
    socketio_server=sio,
    other_asgi_app=app,
    socketio_path="socket.io",
)