"""Rheoson engine — the muscles only Python has.

One job per endpoint, no session state, no database of accounts:

* ``GET /health`` — what this host can actually do (tools, versions, codes)
* ``GET /resolve/{track_id}`` — the relay's resolver: where are the bytes?
* ``GET /probe/{track_id}`` — real content type and length, no bytes
* ``GET /local/{track_id}`` — bytes for a track that is already on this disk
* ``GET /artwork/{track_id}`` — cover art, embedded or from disk
* ``GET /library/*`` — what is on this disk, grouped
* ``GET /search`` — local + YouTube, one answer
* ``GET /lyrics`` — plain and synced lyrics for a track
* ``GET /spotify/resolve`` — a Spotify share link → matched YouTube tracks
* ``POST /spotify/match`` — batch YouTube matching for Spotify track rows
* ``/downloads/*`` — the queue, executed here because the tools live here

Two rules hold across every route: a failure carries its DCCNN chip, and a
missing capability degrades (503 with a code) instead of crashing.
"""

from __future__ import annotations

import mimetypes
import os
import re
import time
from contextlib import asynccontextmanager
from typing import Optional

import structlog
from fastapi import FastAPI, Query, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse

from app.core import error_codes, toolchain
from app.core import settings as engine_settings
from app.core.errors import EngineError
from app.services import downloads, identity, library, metadata, resolve
from app.services import lyrics as lyrics_service
from app.services import search as search_service
from app.services import spotify as spotify_service

log = structlog.get_logger()
settings = engine_settings.load()

#: Minimum track-id acceptance rule, applied before any subprocess, network or
#: filesystem call so an unvalidated id can never become an argument or a path.
MAX_TRACK_ID_LEN = 64

#: Audio mime per extension, for local files answered without a CDN header.
MIME_BY_SUFFIX = {
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".mp4": "audio/mp4",
    ".aac": "audio/aac",
    ".flac": "audio/flac",
    ".ogg": "audio/ogg",
    ".oga": "audio/ogg",
    ".opus": "audio/ogg; codecs=opus",
    ".wav": "audio/wav",
    ".weba": "audio/webm",
    ".webm": "audio/webm",
}

#: ``bytes=START-END`` / ``bytes=START-`` / ``bytes=-SUFFIX``
RANGE_RE = re.compile(r"^bytes=(\d*)-(\d*)$")

#: How much of a local file goes on the wire per chunk.
CHUNK = 64 * 1024


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Boot the durable bits: the identity map and the persisted queue."""
    identity.init()
    spotify_service.init()
    downloads.manager.load()
    log.info(
        "engine.ready",
        dataDir=settings.data_dir,
        tools=toolchain.capabilities(),
    )
    try:
        yield
    finally:
        downloads.manager.shutdown()


app = FastAPI(
    title="Rheoson Engine",
    version="0.2.0",
    docs_url=None,
    redoc_url=None,
    lifespan=lifespan,
)


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


@app.exception_handler(EngineError)
async def engine_error_handler(_request: Request, exc: EngineError) -> JSONResponse:
    """One handler for every service-layer failure — the code is the contract."""
    return _fail(exc.status, exc.code, exc.detail)


def _guard(track_id: str, request: Request) -> Optional[JSONResponse]:
    """The two checks every track route performs before doing any work."""
    if not _authorized(request):
        return _fail(401, "SUP01", "Engine access is not authorized")
    if not resolve.is_valid_track_id(track_id):
        return _fail(400, "SVA03")
    return None


# ── Health ────────────────────────────────────────────────────


@app.get("/health")
async def health() -> dict:
    """Capability report. Never 5xx: a degraded engine is still healthy."""
    caps = toolchain.capabilities()
    return {
        "status": "ok",
        "version": app.version,
        "capabilities": caps,
        "library": library.stats(),
        "identity": identity.stats(),
        "downloads": {"active": len(downloads.manager.list(status="running"))},
        "errorCodes": {"source": error_codes.source()},
    }


@app.get("/")
async def root() -> dict:
    return {"service": "rheoson-engine", "version": app.version, "dataDir": settings.data_dir}


# ── Resolution ────────────────────────────────────────────────


@app.get("/resolve/{track_id}")
async def resolve_track(
    track_id: str,
    request: Request,
    fresh: bool = Query(default=False),
) -> JSONResponse:
    """Where are the bytes for this track?

    A local file is resolved to this engine's own ``/local`` endpoint — the
    first tier of playback, and the cheapest possible answer: seekable bytes
    from disk with no extraction and no network. Anything else is resolved to a
    signed CDN URL.

    ``?fresh=1`` skips the resolved-URL cache. This is not a tuning knob: the
    cache lives for hours, so a caller re-resolving after the CDN refused a URL
    would be handed **the same refused URL**, and its "re-mint once" retry
    would be a no-op that looks like a retry. A refresh is the whole reason the
    parameter exists.

    Returns 404 with ``SUP01`` when every player client declines the track — a
    resolved-and-refused track is a real answer the caller can fall back from,
    not a server error.
    """
    denied = _guard(track_id, request)
    if denied is not None:
        return denied

    local = library.path_for(track_id)
    if local is not None and local.is_file():
        return JSONResponse(
            content={
                "url": f"{settings.public_url.rstrip('/')}/local/{track_id}",
                "contentType": MIME_BY_SUFFIX.get(local.suffix.lower(), "audio/mpeg"),
                "expiresAt": 0,
                "filename": local.name,
                "local": True,
            }
        )

    if not toolchain.ytdlp().available:
        return _fail(503, "DEN02")

    url = await resolve.resolve_direct_url(track_id, use_cache=not fresh)
    if not url:
        return _fail(404, "SUP01")

    content_type = resolve.mime_from_response(url, "")
    return JSONResponse(
        content={
            "url": url,
            "contentType": content_type,
            "expiresAt": int(time.time() + settings.direct_url_ttl),
            "filename": f"{track_id}.m4a",
            "local": False,
        }
    )


@app.get("/probe/{track_id}")
async def probe_track(track_id: str, request: Request) -> JSONResponse:
    """Real content type and byte length for a track, reading no media bytes.

    A local file is measured with ``stat`` — the answer is exact and free.
    """
    denied = _guard(track_id, request)
    if denied is not None:
        return denied

    local = library.path_for(track_id)
    if local is not None and local.is_file():
        return JSONResponse(
            content={
                "mime": MIME_BY_SUFFIX.get(local.suffix.lower(), "audio/mpeg"),
                "bytes": local.stat().st_size,
                "local": True,
            }
        )

    if not toolchain.ytdlp().available:
        return _fail(503, "DEN02")

    probed = await resolve.probe_direct(track_id)
    if probed is None:
        return _fail(502, "SUP02")
    return JSONResponse(content={"mime": probed["mime"], "bytes": probed["bytes"], "local": False})


# ── Local bytes ───────────────────────────────────────────────


def _parse_range(header: str, size: int) -> Optional[tuple[int, int]]:
    """Resolve a Range header to an inclusive (start, end), or None when the
    request is unsatisfiable (the caller answers 416)."""
    if not header:
        return None
    match = RANGE_RE.match(header.strip())
    if match is None:
        return None
    start_raw, end_raw = match.group(1), match.group(2)

    if start_raw == "" and end_raw == "":
        return None
    if start_raw == "":
        # A suffix range: the last N bytes.
        length = int(end_raw)
        if length <= 0:
            return None
        start = max(0, size - length)
        return start, size - 1

    start = int(start_raw)
    if start >= size:
        return None
    end = int(end_raw) if end_raw else size - 1
    return start, min(end, size - 1)


@app.api_route("/local/{track_id}", methods=["GET", "HEAD"])
async def local_bytes(track_id: str, request: Request) -> Response:
    """Bytes for a track that is already on this disk, with range support.

    This is what makes a downloaded track seekable and instant: the player's
    seek is answered by this host's own byte arithmetic, and nothing touches
    the network.
    """
    denied = _guard(track_id, request)
    if denied is not None:
        return denied

    path = library.path_for(track_id)
    if path is None or not path.is_file():
        return _fail(404, "SNF02")

    size = path.stat().st_size
    mime = MIME_BY_SUFFIX.get(path.suffix.lower(), mimetypes.guess_type(path.name)[0] or "audio/mpeg")
    base_headers = {
        "content-type": mime,
        "accept-ranges": "bytes",
        "cache-control": "public, max-age=3600",
        "etag": f'"{track_id}-{size}"',
    }

    range_header = request.headers.get("range", "")
    span = _parse_range(range_header, size)
    if range_header and span is None:
        return _fail(416, "SVA01", range_header)

    start, end = span if span else (0, size - 1)
    length = end - start + 1
    status = 206 if span else 200

    headers = {
        **base_headers,
        "content-length": str(length),
        **({"content-range": f"bytes {start}-{end}/{size}"} if span else {}),
    }
    if request.method == "HEAD":
        return Response(status_code=status, headers=headers)

    def body():
        with open(path, "rb") as handle:
            handle.seek(start)
            remaining = length
            while remaining > 0:
                chunk = handle.read(min(CHUNK, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    return StreamingResponse(body(), status_code=status, headers=headers, media_type=mime)


@app.get("/artwork/{track_id}")
async def artwork(track_id: str, request: Request) -> Response:
    """Cover art for a local track: embedded, else the sibling image file.

    Serving it from here (rather than fetching an arbitrary URL) is what keeps
    the client's artwork requests free of SSRF surface — the client names a
    track, never a host.
    """
    denied = _guard(track_id, request)
    if denied is not None:
        return denied

    path = library.path_for(track_id)
    if path is None:
        return _fail(404, "SNF02")

    from_disk = metadata.artwork_from_disk(path)
    if from_disk is not None:
        data, mime = from_disk
    else:
        embedded = metadata.extract_artwork_bytes(path)
        if embedded is None:
            return _fail(404, "SUP04")
        data, mime = embedded, "image/jpeg"

    return Response(
        content=data,
        media_type=mime,
        headers={"cache-control": "public, max-age=86400"},
    )


# ── Library ───────────────────────────────────────────────────


def _bounded(limit: int, offset: int) -> tuple[int, int]:
    """Clamp pagination so a list request cannot ask for the whole disk."""
    return max(1, min(limit, 500)), max(0, offset)


@app.get("/library/tracks")
async def library_tracks(
    request: Request,
    limit: int = Query(default=200),
    offset: int = Query(default=0),
) -> JSONResponse:
    if not _authorized(request):
        return _fail(401, "SUP01", "Engine access is not authorized")
    take, skip = _bounded(limit, offset)
    records = library.tracks()
    return JSONResponse(
        content={
            "tracks": records[skip : skip + take],
            "total": len(records),
            "offset": skip,
            "limit": take,
        }
    )


@app.get("/library/tracks/{track_id}")
async def library_track(track_id: str, request: Request) -> JSONResponse:
    """One track by id.

    Playlists store ids, so opening one has to resolve each id — reading the
    whole library to do that would make a 20-track playlist cost a full scan.
    Registered under the static ``/library/tracks`` path: Fastify and FastAPI
    both match the literal segment first, so the list route is never swallowed.
    """
    if not _authorized(request):
        return _fail(401, "SUP01", "Engine access is not authorized")
    if not resolve.is_valid_track_id(track_id):
        return _fail(400, "SVA03")

    record = library.find(track_id)
    if record is None:
        return _fail(404, "TNF01")
    return JSONResponse(content={"track": record})


@app.get("/library/artists")
async def library_artists(request: Request) -> JSONResponse:
    if not _authorized(request):
        return _fail(401, "SUP01", "Engine access is not authorized")
    return JSONResponse(content={"artists": library.artists()})


@app.get("/library/albums")
async def library_albums(request: Request) -> JSONResponse:
    if not _authorized(request):
        return _fail(401, "SUP01", "Engine access is not authorized")
    return JSONResponse(content={"albums": library.albums()})


@app.get("/library/artists/{name}")
async def library_artist_tracks(name: str, request: Request) -> JSONResponse:
    """One artist's tracks — the drill-down the artist page renders."""
    if not _authorized(request):
        return _fail(401, "SUP01", "Engine access is not authorized")
    needle = name.strip().lower()
    if not needle:
        return _fail(400, "LNF02")
    tracks = [t for t in library.scan() if t["artist"]["name"].lower() == needle]
    if not tracks:
        return _fail(404, "LNF02")
    return JSONResponse(content={"artist": {"id": name, "name": name}, "tracks": tracks})


@app.get("/library/albums/{album_id}")
async def library_album_tracks(album_id: str, request: Request) -> JSONResponse:
    """One album's tracks. The id is the engine's own ``artist\x00title``
    grouping key, URL-encoded by the caller, so it round-trips exactly."""
    if not _authorized(request):
        return _fail(401, "SUP01", "Engine access is not authorized")
    import urllib.parse

    key = urllib.parse.unquote(album_id)
    tracks = [t for t in library.scan() if f"{t['artist']['name']}\x00{t['album']['title']}" == key]
    if not tracks:
        return _fail(404, "LNF03")
    first = tracks[0]
    album = {"id": key, "title": first["album"]["title"], "artist": first["artist"]}
    return JSONResponse(content={"album": album, "tracks": tracks})


@app.post("/library/rescan")
async def library_rescan(request: Request) -> JSONResponse:
    """Force a rescan. Called by the server after a completed download so a new
    file is visible immediately instead of after the cache lapses."""
    if not _authorized(request):
        return _fail(401, "SUP01", "Engine access is not authorized")
    library.invalidate()
    return JSONResponse(content={"rescaned": True, "library": library.stats()})


# ── Search ────────────────────────────────────────────────────


@app.get("/search")
async def search(
    request: Request,
    q: str = Query(default=""),
    remote: bool = Query(default=True),
    limit: int = Query(default=20),
) -> JSONResponse:
    """Local and remote results in one answer.

    ``remote=false`` is the honest \"search my library\" mode: no extraction, no
    network, no waiting.
    """
    if not _authorized(request):
        return _fail(401, "SUP01", "Engine access is not authorized")

    query = search_service.clean_query(q)
    if not query:
        return _fail(400, "RVA04")
    take = max(1, min(limit, 50))
    result = search_service.search(query, include_remote=remote)
    return JSONResponse(content={**result, "limit": take})


# ── Spotify share links ───────────────────────────────────────


def _spotify_payload_error(exc: spotify_service.SpotifyError) -> JSONResponse:
    """The service's coded failure on the wire — same shape as every route."""
    return _fail(exc.status, exc.code, exc.detail)


@app.get("/spotify/resolve")
async def spotify_resolve(
    request: Request,
    url: str = Query(default=""),
    match: bool = Query(default=True),
) -> JSONResponse:
    """A Spotify share link → the engine's Track shape.

    ``match=false`` skips the YouTube lookups: the caller gets pure Spotify
    metadata, fast, and can match later in a batch. Each track carries either
    a ``videoId`` (playable, streamable, downloadable) or ``matchError``.
    """
    if not _authorized(request):
        return _fail(401, "SUP01", "Engine access is not authorized")
    if not url.strip():
        return _fail(400, "RVA01")
    try:
        return JSONResponse(content=spotify_service.resolve_link(url, match=match))
    except spotify_service.SpotifyError as exc:
        return _spotify_payload_error(exc)


@app.post("/spotify/match")
async def spotify_match(request: Request) -> JSONResponse:
    """Batch YouTube matching for Spotify track rows.

    The client keeps unmatched rows locally (a playlist import may match 30
    of 50); this fills the rest without re-fetching Spotify metadata that
    has not changed.
    """
    if not _authorized(request):
        return _fail(401, "SUP01", "Engine access is not authorized")
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        return _fail(400, "RVA03", "Body must be JSON with a tracks list")
    rows = body.get("tracks") if isinstance(body, dict) else None
    if not isinstance(rows, list) or not rows:
        return _fail(400, "RVA03", "A non-empty tracks list is required")
    if len(rows) > spotify_service.MAX_BATCH:
        return _fail(400, "RVA03", f"At most {spotify_service.MAX_BATCH} tracks per batch")

    clean: list[dict] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        spotify_id = str(row.get("spotifyId") or "").strip()
        if not spotify_id or len(spotify_id) > spotify_service.MAX_ID_LEN:
            continue
        clean.append(
            {
                "spotifyId": spotify_id,
                "title": str(row.get("title") or "")[:200],
                "artist": str(row.get("artist") or "Unknown Artist")[:200],
                "durationMs": row.get("durationMs") if isinstance(row.get("durationMs"), int) else None,
                "artworkUrl": row.get("artworkUrl"),
            }
        )
    if not clean:
        return _fail(400, "RVA03", "No usable tracks in the batch")

    return JSONResponse(content={"tracks": [_t(s) for s in spotify_service.match_tracks(clean)]})


def _t(track: dict) -> dict:
    """Wire dict for a matched Spotify row — id or the honest unmatched state."""
    return spotify_service._to_track(track)


# ── Lyrics ────────────────────────────────────────────────────


@app.get("/lyrics")
async def lyrics(
    request: Request,
    title: str = Query(...),
    artist: str = Query(default=""),
    album: str = Query(default=""),
    duration: float = Query(default=0.0),
) -> JSONResponse:
    """Lyrics for a track, with the synced timeline parsed for tap-to-seek."""
    if not _authorized(request):
        return _fail(401, "SUP01", "Engine access is not authorized")
    if not title.strip():
        return _fail(400, "RVA03")

    found = await lyrics_service.fetch_lyrics(title, artist, album=album, duration=duration)
    if found is None:
        return _fail(404, "RNF01")

    return JSONResponse(
        content={**found, "lines": lyrics_service.parse_synced(found.get("synced", ""))}
    )


# ── Downloads ─────────────────────────────────────────────────


@app.get("/downloads")
async def list_downloads(
    request: Request,
    owner: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
) -> JSONResponse:
    if not _authorized(request):
        return _fail(401, "SUP01", "Engine access is not authorized")
    jobs = downloads.manager.list(owner=owner, status=status)
    return JSONResponse(content={"jobs": jobs, "total": len(jobs)})


@app.post("/downloads")
async def create_download(request: Request) -> JSONResponse:
    """Create and start a download. The body mirrors what the client sends; the
    owner always comes from the server's header, never from the client."""
    if not _authorized(request):
        return _fail(401, "SUP01", "Engine access is not authorized")

    try:
        body = await request.json()
    except Exception:  # noqa: BLE001 — a malformed body is a validation failure
        raise EngineError("DVA03", 400, "Invalid request body") from None
    if not isinstance(body, dict):
        raise EngineError("DVA03", 400, "Invalid request body")

    owner = request.headers.get("x-owner-id", "").strip()
    if not owner:
        raise EngineError("DVA03", 400, "A download needs an owner")

    job = downloads.manager.create(
        owner=owner,
        track_id=_opt_str(body.get("trackId") or body.get("track_id")),
        url=_opt_str(body.get("url")),
        title=_opt_str(body.get("title")) or "",
    )
    return JSONResponse(content=job.to_dict(), status_code=202)


@app.get("/downloads/{job_id}")
async def get_download(job_id: str, request: Request) -> JSONResponse:
    if not _authorized(request):
        return _fail(401, "SUP01", "Engine access is not authorized")
    return JSONResponse(
        content=downloads.manager.get(job_id, owner=request.query_params.get("owner") or None)
    )


@app.post("/downloads/{job_id}/cancel")
async def cancel_download(job_id: str, request: Request) -> JSONResponse:
    if not _authorized(request):
        return _fail(401, "SUP01", "Engine access is not authorized")
    return JSONResponse(
        content=downloads.manager.cancel(job_id, owner=request.query_params.get("owner") or None)
    )


@app.post("/downloads/{job_id}/retry")
async def retry_download(job_id: str, request: Request) -> JSONResponse:
    """Retry a job. ``resume`` defaults to \"continue when there is something to
    continue from\" — the staged bytes exist precisely to be reused."""
    if not _authorized(request):
        return _fail(401, "SUP01", "Engine access is not authorized")

    resume: Optional[bool] = None
    if request.headers.get("content-length", "0") != "0":
        try:
            body = await request.json()
            if isinstance(body, dict) and isinstance(body.get("resume"), bool):
                resume = body["resume"]
        except Exception:  # noqa: BLE001 — an absent/!json body means \"auto\"
            resume = None

    return JSONResponse(
        content=downloads.manager.retry(
            job_id, owner=request.query_params.get("owner") or None, resume=resume
        )
    )


@app.delete("/downloads/{job_id}")
async def delete_download(job_id: str, request: Request) -> JSONResponse:
    if not _authorized(request):
        return _fail(401, "SUP01", "Engine access is not authorized")
    return JSONResponse(
        content=downloads.manager.delete(job_id, owner=request.query_params.get("owner") or None)
    )


def _opt_str(value: object) -> Optional[str]:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def run() -> None:
    """Entry point for `python -m app.main` / the container command."""
    import uvicorn

    host = os.environ.get("ENGINE_HOST", "0.0.0.0").strip() or "0.0.0.0"
    log.info("engine starting", host=host, port=settings.port, dataDir=settings.data_dir)
    uvicorn.run(app, host=host, port=settings.port, log_config=None)


if __name__ == "__main__":
    run()
