"""Rheoson engine — the muscles only Python has.

One job per endpoint, no session state, no database:

* ``GET /health`` — what this host can actually do (tools, versions, codes)
* ``GET /resolve/{track_id}`` — the relay's resolver: a playable CDN URL
* ``GET /probe/{track_id}`` — real content type and length, no bytes

Downloads, tagging and the queue arrive in a later milestone; the resolve path
is what makes "press play, hear sound" work, and it is deliberately the first
thing carved so the rest of the stack can be validated against it.
"""

from __future__ import annotations

import asyncio
import os
import time

import structlog
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.core import error_codes, settings as engine_settings, toolchain
from app.services import resolve

log = structlog.get_logger()
settings = engine_settings.load()

app = FastAPI(title="Rheoson Engine", version="0.1.0", docs_url=None, redoc_url=None)

#: Minimum track-id acceptance rule, applied before any subprocess or network
#: call so an unvalidated id can never become an argument.
MAX_TRACK_ID_LEN = 64


def _authorized(request: Request) -> bool:
    """Service-token check. An unset token means "trust the network"."""
    if not settings.token:
        return True
    header = request.headers.get("authorization", "").strip()
    if header.lower().startswith("bearer "):
        return header[7:].strip() == settings.token
    return request.headers.get("x-engine-token", "").strip() == settings.token


def _fail(status: int, code: str, detail: str | None = None) -> JSONResponse:
    """Every engine failure carries its DCCNN chip, like every other surface."""
    return JSONResponse(
        status_code=status,
        content={"error": error_codes.wire(code, detail), "code": code},
    )


@app.get("/health")
async def health() -> dict:
    """Capability report. Never 5xx: a degraded engine is still healthy."""
    caps = await asyncio.to_thread(toolchain.capabilities)
    return {
        "status": "ok",
        "version": app.version,
        "capabilities": caps,
        "errorCodes": {"source": error_codes.source()},
    }


@app.get("/resolve/{track_id}")
async def resolve_track(track_id: str, request: Request) -> JSONResponse:
    """Resolve a track id to a CDN URL the relay can stream from.

    Returns 404 with ``SUP01`` when every player client declines the track —
    a resolved-and-refused track is a real answer, not a server error, and the
    caller's fallback must be able to tell the difference.
    """
    if not _authorized(request):
        return _fail(401, "SUP01", "Engine access is not authorized")
    if not resolve.is_valid_track_id(track_id):
        return _fail(400, "SVA03")
    if not toolchain.ytdlp().available:
        return _fail(503, "DEN02")

    url = await resolve.resolve_direct_url(track_id)
    if not url:
        return _fail(404, "SUP01")

    # Pure string work — no thread hop needed.
    content_type = resolve.mime_from_response(url, "")
    ttl = settings.direct_url_ttl
    return JSONResponse(
        content={
            "url": url,
            "contentType": content_type,
            "expiresAt": int(time.time() + ttl),
            "filename": f"{track_id}.m4a",
        }
    )


@app.get("/probe/{track_id}")
async def probe_track(track_id: str, request: Request) -> JSONResponse:
    """Real content type and byte length for a track, reading no media bytes."""
    if not _authorized(request):
        return _fail(401, "SUP01", "Engine access is not authorized")
    if not resolve.is_valid_track_id(track_id):
        return _fail(400, "SVA03")
    if not toolchain.ytdlp().available:
        return _fail(503, "DEN02")

    probed = await resolve.probe_direct(track_id)
    if probed is None:
        return _fail(502, "SUP02")
    return JSONResponse(content={"mime": probed["mime"], "bytes": probed["bytes"]})


@app.get("/")
async def root() -> dict:
    return {"service": "rheoson-engine", "version": app.version, "dataDir": settings.data_dir}


def run() -> None:
    """Entry point for `python -m app.main` / the container command."""
    import uvicorn

    host = os.environ.get("ENGINE_HOST", "0.0.0.0").strip() or "0.0.0.0"
    log.info("engine starting", host=host, port=settings.port, dataDir=settings.data_dir)
    uvicorn.run(app, host=host, port=settings.port, log_config=None)


if __name__ == "__main__":
    run()
