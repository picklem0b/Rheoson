from __future__ import annotations
import json
import asyncio
import structlog
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, HTTPException
from app.core.config import settings
from app.services.metadata_service import read_track_metadata
from app.services.ytmusic_service import get_track as yt_get_track
from app.schemas.track import TrackSchema

log    = structlog.get_logger()
router = APIRouter()

AUDIO_EXTS = {"mp3", "flac", "m4a", "ogg", "opus", "wav"}

# ── File paths ────────────────────────────────────────────────

def _liked_file()   -> Path: return Path(settings.MUSIC_DIR) / ".liked.json"
def _history_file() -> Path: return Path(settings.MUSIC_DIR) / ".history.json"


# ── Async JSON helpers ────────────────────────────────────────
# Using run_in_executor so JSON file writes don't block the event loop.

async def _read_json(path: Path, default):
    def _r():
        if not path.exists():
            return default
        try:
            return json.loads(path.read_text())
        except Exception:
            return default
    return await asyncio.get_event_loop().run_in_executor(None, _r)


async def _write_json(path: Path, data) -> None:
    def _w():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data))
    await asyncio.get_event_loop().run_in_executor(None, _w)


# ── Track hydration ───────────────────────────────────────────

async def _hydrate_track(track_id: str) -> dict | None:
    """
    Given a YouTube video ID, return a full TrackSchema dict.
    Checks local library first, falls back to YouTube Music API.
    """
    music_dir = Path(settings.MUSIC_DIR)
    if music_dir.exists():
        for path in music_dir.rglob("*"):
            if path.suffix.lstrip(".") in AUDIO_EXTS:
                try:
                    t = read_track_metadata(path)
                    if t["id"] == track_id:
                        return t
                except Exception:
                    continue
    try:
        return await yt_get_track(track_id)
    except Exception:
        log.warning("tracks.hydrate.failed", track_id=track_id)
        return None


# ── Routes ────────────────────────────────────────────────────

@router.get("/", response_model=list[TrackSchema])
async def list_tracks():
    """List all locally downloaded tracks."""
    music_dir = Path(settings.MUSIC_DIR)
    if not music_dir.exists():
        return []

    tracks = []
    for path in sorted(music_dir.rglob("*")):
        if path.suffix.lstrip(".") in AUDIO_EXTS:
            try:
                tracks.append(read_track_metadata(path))
            except Exception:
                continue
    return tracks


@router.get("/liked/count")
async def get_liked_count():
    """Cheap count for the Library pinned card — no track hydration."""
    ids = await _read_json(_liked_file(), [])
    return {"count": len(ids)}


@router.get("/liked", response_model=list[TrackSchema])
async def get_liked():
    """
    Return full track objects for liked tracks.
    Liked IDs are stored; hydrated on read so metadata is always fresh.
    """
    ids: list[str] = await _read_json(_liked_file(), [])
    if not ids:
        return []

    # Hydrate concurrently — cap at 10 parallel requests
    sem = asyncio.Semaphore(10)

    async def _safe(track_id: str):
        async with sem:
            return await _hydrate_track(track_id)

    results = await asyncio.gather(*[_safe(tid) for tid in ids])
    return [r for r in results if r is not None]


@router.get("/recently-played", response_model=list[TrackSchema])
async def get_recently_played():
    """
    Return recently played tracks as full TrackSchema objects.
    History stores {id, playedAt} — hydrated on read.
    """
    history: list[dict] = await _read_json(_history_file(), [])
    if not history:
        return []

    ids = [h["id"] for h in history[:50]]  # cap at 50

    sem = asyncio.Semaphore(10)

    async def _safe(track_id: str):
        async with sem:
            return await _hydrate_track(track_id)

    results = await asyncio.gather(*[_safe(tid) for tid in ids])
    return [r for r in results if r is not None]


@router.get("/trending", response_model=list[TrackSchema])
async def get_trending():
    """
    Trending tracks — proxied from YouTube Music charts.
    Falls back to empty list if ytmusicapi fails.
    """
    try:
        from app.services.ytmusic_service import get_trending as yt_trending
        return await yt_trending()
    except Exception as e:
        log.warning("tracks.trending.failed", error=str(e))
        return []


@router.get("/{track_id}", response_model=TrackSchema)
async def get_track(track_id: str):
    t = await _hydrate_track(track_id)
    if not t:
        raise HTTPException(status_code=404, detail=f"Track not found: {track_id}")
    return t


@router.post("/{track_id}/like")
async def like_track(track_id: str):
    liked: list[str] = await _read_json(_liked_file(), [])
    if track_id not in liked:
        liked.append(track_id)
    await _write_json(_liked_file(), liked)
    return {"liked": True, "count": len(liked)}


@router.delete("/{track_id}/like")
async def unlike_track(track_id: str):
    liked: list[str] = await _read_json(_liked_file(), [])
    liked = [i for i in liked if i != track_id]
    await _write_json(_liked_file(), liked)
    return {"liked": False, "count": len(liked)}


@router.post("/{track_id}/play")
async def record_play(track_id: str):
    """Record a play event. Dedupes and keeps last 200 entries."""
    history: list[dict] = await _read_json(_history_file(), [])
    history = [h for h in history if h.get("id") != track_id]
    history.insert(0, {"id": track_id, "playedAt": datetime.utcnow().isoformat()})
    history = history[:200]
    await _write_json(_history_file(), history)
    return {"ok": True}