from __future__ import annotations
import json
import asyncio
import structlog
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.core.config import settings
from app.core.database import get_db
from app.services.metadata_service import read_track_metadata
from app.services.ytmusic_service import get_track as yt_get_track
from app.services.signal_service import record_signal
from app.models.recommendation import SignalType
from app.schemas.track_schema import TrackSchema

log    = structlog.get_logger()
router = APIRouter()

AUDIO_EXTS = {'mp3', 'flac', 'm4a', 'ogg', 'opus', 'wav'}

# ── Track index cache ─────────────────────────────────────────
# Built lazily on first request and invalidated after a download completes.
# Without this, every request to /tracks/recently-played scans the entire
# MUSIC_DIR, which on a large library adds hundreds of milliseconds per call.

_track_index: dict[str, dict] | None = None


def invalidate_track_index() -> None:
    """
    Blow away the in-memory track index so the next request rebuilds it.
    Called by download_service after a download completes so newly downloaded
    files appear immediately in /tracks and /tracks/recently-played.

    Previously this function didn't exist, causing download_service to silently
    swallow an ImportError and newly downloaded tracks to only appear after a
    server restart.
    """
    global _track_index
    _track_index = None
    log.debug('tracks.index.invalidated')


async def _build_index() -> dict[str, dict]:
    """Scan ALL configured music dirs and return {track_id: track_dict}.

    Previously only scanned MUSIC_DIR, so tracks in EXTRA_MUSIC_DIRS
    (e.g. /storage/emulated/0/Music) were invisible to liked, recently-played,
    and trending endpoints.
    """
    global _track_index
    if _track_index is not None:
        return _track_index

    idx: dict[str, dict] = {}
    all_dirs = settings.all_music_dirs
    if not all_dirs:
        _track_index = idx
        return idx

    def _scan():
        result = {}
        for d in all_dirs:
            music_dir = Path(d)
            if not music_dir.exists():
                continue
            for path in music_dir.rglob('*'):
                if path.suffix.lstrip('.') in AUDIO_EXTS:
                    try:
                        t = read_track_metadata(path)
                        result[t['id']] = t
                    except Exception:
                        continue
        return result

    loop = asyncio.get_event_loop()
    idx  = await loop.run_in_executor(None, _scan)
    _track_index = idx
    log.debug('tracks.index.built', count=len(idx), dirs=len(all_dirs))
    return idx

# ── File paths ────────────────────────────────────────────────

# ── MongoDB helpers for liked / history (user-isolated) ────────

async def _get_user_id(db: AsyncIOMotorDatabase, request_user: dict | None) -> str:
    """Return user_id from authenticated user or fall back to anonymous."""
    if request_user:
        return str(request_user['_id'])
    return 'anonymous'


# NOTE: The following endpoints now accept an optional query parameter
# 'user_id' for backward compatibility. When auth is enforced, the user_id
# will come from the JWT token via get_current_user dependency.

# ── Track hydration ───────────────────────────────────────────

async def _hydrate_track(track_id: str) -> dict | None:
    """Return track metadata, preferring local files over YouTube API."""
    idx = await _build_index()
    if track_id in idx:
        return idx[track_id]
    try:
        return await yt_get_track(track_id)
    except Exception:
        log.warning('tracks.hydrate.failed', track_id=track_id)
        return None

# ── STATIC ROUTES FIRST ───────────────────────────────────────
# FastAPI matches routes in registration order. If /{track_id} were
# registered first, GET /liked would resolve as track_id="liked" → 404.

@router.get('/', response_model=list[TrackSchema])
async def list_tracks():
    """All files currently on disk in MUSIC_DIR."""
    idx = await _build_index()
    return sorted(idx.values(), key=lambda t: t.get('title', '').lower())


@router.get('/liked/count')
async def get_liked_count(db: AsyncIOMotorDatabase = Depends(get_db)):
    """Cheap count for the Library pinned card — no track hydration."""
    doc = await db.liked_tracks.find_one({'user_id': 'anonymous'})
    ids = doc.get('track_ids', []) if doc else []
    return {'count': len(ids)}


@router.get('/liked', response_model=list[TrackSchema])
async def get_liked(db: AsyncIOMotorDatabase = Depends(get_db)):
    doc = await db.liked_tracks.find_one({'user_id': 'anonymous'})
    ids: list[str] = doc.get('track_ids', []) if doc else []
    if not ids:
        return []
    sem = asyncio.Semaphore(10)
    async def _safe(tid: str):
        async with sem:
            return await _hydrate_track(tid)
    results = await asyncio.gather(*[_safe(tid) for tid in ids])
    return [r for r in results if r is not None]


@router.get('/recently-played', response_model=list[TrackSchema])
async def get_recently_played(db: AsyncIOMotorDatabase = Depends(get_db)):
    doc = await db.listening_history.find_one({'user_id': 'anonymous'})
    history: list[dict] = doc.get('entries', []) if doc else []
    if not history:
        return []
    ids = [h['id'] for h in history[:50]]
    sem = asyncio.Semaphore(10)
    async def _safe(tid: str):
        async with sem:
            return await _hydrate_track(tid)
    results = await asyncio.gather(*[_safe(tid) for tid in ids])
    return [r for r in results if r is not None]


@router.get('/trending', response_model=list[TrackSchema])
async def get_trending():
    try:
        from app.services.ytmusic_service import get_trending as yt_trending
        return await yt_trending()
    except Exception as e:
        log.warning('tracks.trending.failed', error=str(e))
        return []


@router.delete('/history')
async def clear_history(db: AsyncIOMotorDatabase = Depends(get_db)):
    await db.listening_history.delete_one({'user_id': 'anonymous'})
    return {'ok': True}

# ── Signal reporting ─────────────────────────────────────────

@router.post('/signals')
async def report_signal(body: dict, db: AsyncIOMotorDatabase = Depends(get_db)):
    """Record a behavioral signal from the frontend.
    
    Accepts: { signal, track_id?, artist?, progress?, context? }
    """
    signal_str = body.get('signal')
    try:
        signal_type = SignalType(signal_str)
    except ValueError:
        raise HTTPException(status_code=400, detail=f'Unknown signal: {signal_str}')
    
    # Hydrate artist info if not provided
    artist = body.get('artist')
    if not artist and body.get('track_id'):
        t = await _hydrate_track(body['track_id'])
        if t:
            artist = t.get('artist', {}).get('name')
    
    await record_signal(
        db,
        user_id='anonymous',
        signal=signal_type,
        track_id=body.get('track_id'),
        artist=artist,
        progress=body.get('progress'),
        session_id=body.get('session_id'),
        context=body.get('context', {}),
    )
    return {'ok': True}


# ── VARIABLE ROUTES LAST ──────────────────────────────────────

@router.get('/{track_id}', response_model=TrackSchema)
async def get_track(track_id: str):
    t = await _hydrate_track(track_id)
    if not t:
        raise HTTPException(status_code=404, detail=f'Track not found: {track_id}')
    return t


@router.post('/{track_id}/like')
async def like_track(track_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    doc = await db.liked_tracks.find_one({'user_id': 'anonymous'})
    liked: list[str] = doc.get('track_ids', []) if doc else []
    if track_id not in liked:
        liked.append(track_id)
    await db.liked_tracks.update_one(
        {'user_id': 'anonymous'},
        {'$set': {'track_ids': liked}},
        upsert=True,
    )
    # Record signal for recommendation engine
    t = await _hydrate_track(track_id)
    await record_signal(db, user_id='anonymous', signal=SignalType.LIKE, track_id=track_id, artist=t.get('artist', {}).get('name') if t else None)
    return {'liked': True, 'count': len(liked)}


@router.delete('/{track_id}/like')
async def unlike_track(track_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    doc = await db.liked_tracks.find_one({'user_id': 'anonymous'})
    liked: list[str] = doc.get('track_ids', []) if doc else []
    liked = [i for i in liked if i != track_id]
    await db.liked_tracks.update_one(
        {'user_id': 'anonymous'},
        {'$set': {'track_ids': liked}},
        upsert=True,
    )
    await record_signal(db, user_id='anonymous', signal=SignalType.UNLIKE, track_id=track_id)
    return {'liked': False, 'count': len(liked)}


@router.post('/{track_id}/play')
async def record_play(track_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    doc = await db.listening_history.find_one({'user_id': 'anonymous'})
    history: list[dict] = doc.get('entries', []) if doc else []
    history = [h for h in history if h.get('id') != track_id]
    history.insert(0, {'id': track_id, 'playedAt': datetime.now(timezone.utc).isoformat()})
    history = history[:200]
    await db.listening_history.update_one(
        {'user_id': 'anonymous'},
        {'$set': {'entries': history}},
        upsert=True,
    )
    # Record signal for recommendation engine
    t = await _hydrate_track(track_id)
    await record_signal(db, user_id='anonymous', signal=SignalType.PLAY_START, track_id=track_id, artist=t.get('artist', {}).get('name') if t else None)
    return {'ok': True}