"""A Spotify link becomes download jobs, in the background, with progress.

Matching a playlist is the slow part: every song is a YouTube Music search, and
a real playlist has hundreds. Doing that inside the POST would either time out
or leave the user staring at a spinner with no idea whether it worked. So the
POST creates an *import*, the matching and queueing run as a task, and the UI
polls a small state document while the ordinary download jobs report their own
progress over the socket.

The state lives in this process. That is honest for this app — one uvicorn
worker, the same assumption `download_service` already makes for its job
registry — and it is pruned so a long-running instance cannot accumulate
finished imports forever.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any

import structlog

from app.services import search_service
from app.services.download_service import enqueue_download, get_all_jobs

log = structlog.get_logger()

# Job states that mean "this track is already on its way"; a second import of
# the same playlist must not queue the same song twice.
_ACTIVE = {"queued", "searching", "downloading", "converting", "tagging"}
_MAX_IMPORTS = 40


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


_imports: dict[str, dict[str, Any]] = {}
_tasks: dict[str, asyncio.Task] = {}


def _prune() -> None:
    if len(_imports) <= _MAX_IMPORTS:
        return
    finished = sorted(
        (i for i in _imports.values() if i.get("status") in {"done", "error"}),
        key=lambda i: i.get("createdAt") or "",
    )
    for item in finished[: max(0, len(_imports) - _MAX_IMPORTS)]:
        _imports.pop(item["id"], None)
        _tasks.pop(item["id"], None)


def _cover(resolved: dict) -> tuple[str, str]:
    """The collection's own name and artwork, from whichever list carries it."""
    for key in ("playlists", "albums"):
        items = resolved.get(key) or []
        if items and isinstance(items[0], dict):
            item = items[0]
            return (
                str(item.get("title") or ""),
                str(item.get("artworkUrl") or ""),
            )
    artists = resolved.get("artists") or []
    if artists and isinstance(artists[0], dict):
        return str(artists[0].get("name") or ""), str(artists[0].get("imageUrl") or "")
    tracks = resolved.get("tracks") or []
    if tracks and isinstance(tracks[0], dict):
        return str(tracks[0].get("title") or ""), str(tracks[0].get("artworkUrl") or "")
    return "", ""


async def _run(import_id: str, url: str, owner: str | None, options: dict) -> None:
    state = _imports.get(import_id)
    if state is None:
        return
    try:
        state["status"] = "resolving"
        resolved = await search_service.resolve_url(url)

        tracks = [
            t for t in (resolved.get("tracks") or [])
            if isinstance(t, dict) and (t.get("youtubeId") or t.get("id"))
        ]
        title, artwork = _cover(resolved)
        state.update(
            {
                "kind": str(resolved.get("type") or ""),
                "title": title,
                "artworkUrl": artwork,
                "total": int(resolved.get("total") or 0) or len(tracks),
                "matched": len(tracks),
                "skipped": int(resolved.get("skipped") or 0),
                "unmatched": list(resolved.get("unmatched") or []),
                "status": "queueing",
            }
        )

        limit = max(1, int(options.get("limit") or 200))
        skip_existing = bool(options.get("skipExisting", True))
        in_flight = {
            str(j.get("trackId"))
            for j in get_all_jobs(owner=owner)
            if j.get("status") in _ACTIVE
        }

        queued = 0
        skipped_existing = 0
        for track in tracks[:limit]:
            track_id = str(track.get("youtubeId") or track.get("id") or "")
            if not track_id:
                continue
            if skip_existing and track_id in in_flight:
                skipped_existing += 1
                state["skippedExisting"] = skipped_existing
                continue
            await enqueue_download(
                track_id=track_id,
                fmt=options.get("format", "mp3"),
                quality=options.get("quality", "320"),
                embed_artwork=bool(options.get("embedArtwork", True)),
                embed_lyrics=bool(options.get("embedLyrics", True)),
                embed_metadata=bool(options.get("embedMetadata", True)),
                file_naming=options.get("fileNaming", "artist-title"),
                custom_path=options.get("customPath"),
                retries=int(options.get("retries", 3)),
                speed_limit=int(options.get("speedLimit", 0)),
                concurrency=int(options.get("concurrency", 3)),
                owner=owner,
            )
            queued += 1
            state["queued"] = queued

        state.update(
            {
                "queued": queued,
                "skippedExisting": skipped_existing,
                "status": "done",
                "finishedAt": _now(),
            }
        )
        log.info(
            "spotify_import.done",
            import_id=import_id,
            kind=state.get("kind"),
            total=state.get("total"),
            matched=state.get("matched"),
            queued=queued,
            skipped_existing=skipped_existing,
        )
    except Exception as e:  # noqa: BLE001 — the import reports, the route stays up
        state.update({"status": "error", "error": str(e), "finishedAt": _now()})
        log.warning("spotify_import.failed", import_id=import_id, url=url, error=str(e))


def start_import(url: str, owner: str | None, options: dict) -> dict:
    """Create the import and its task; returns the state document immediately."""
    _prune()
    import_id = str(uuid.uuid4())
    state: dict[str, Any] = {
        "id": import_id,
        "owner": owner,
        "status": "resolving",
        "url": url,
        "kind": "",
        "title": "",
        "artworkUrl": "",
        "total": 0,
        "matched": 0,
        "queued": 0,
        "skipped": 0,
        "skippedExisting": 0,
        "unmatched": [],
        "error": None,
        "createdAt": _now(),
        "finishedAt": None,
    }
    _imports[import_id] = state
    _tasks[import_id] = asyncio.create_task(_run(import_id, url, owner, options))
    return dict(state)


def get_import(import_id: str, owner: str | None) -> dict | None:
    state = _imports.get(import_id)
    if state is None:
        return None
    # Imports belong to the account that started them. Jobs already carry an
    # owner; leaving the import unscoped would leak titles and links.
    owner_of = state.get("owner")
    if owner_of is not None and owner_of != owner:
        return None
    public = dict(state)
    public.pop("owner", None)
    return public


def reset() -> None:
    """Test hook: forget every import and cancel what is still running."""
    for task in _tasks.values():
        if not task.done():
            task.cancel()
    _imports.clear()
    _tasks.clear()
