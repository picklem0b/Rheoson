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

def _liked_file()   -> Path: return Path(settings.MUSIC_DIR) / '.liked.json'
def _history_file() -> Path: return Path(settings.MUSIC_DIR) / '.history.json'

# ── Async JSON helpers ────────────────────────────────────────

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
async def get_liked_count():
    """Cheap count for the Library pinned card — no track hydration."""
    ids = await _read_json(_liked_file(), [])
    return {'count': len(ids)}


@router.get('/liked', response_model=list[TrackSchema])
async def get_liked():
    ids: list[str] = await _read_json(_liked_file(), [])
    if not ids:
        return []
    sem = asyncio.Semaphore(10)
    async def _safe(tid: str):
        async with sem:
            return await _hydrate_track(tid)
    results = await asyncio.gather(*[_safe(tid) for tid in ids])
    return [r for r in results if r is not None]


@router.get('/recently-played', response_model=list[TrackSchema])
async def get_recently_played():
    history: list[dict] = await _read_json(_history_file(), [])
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
async def clear_history():
    await _write_json(_history_file(), [])
    return {'ok': True}

# ── VARIABLE ROUTES LAST ──────────────────────────────────────

@router.get('/{track_id}', response_model=TrackSchema)
async def get_track(track_id: str):
    t = await _hydrate_track(track_id)
    if not t:
        raise HTTPException(status_code=404, detail=f'Track not found: {track_id}')
    return t


@router.post('/{track_id}/like')
async def like_track(track_id: str):
    liked: list[str] = await _read_json(_liked_file(), [])
    if track_id not in liked:
        liked.append(track_id)
    await _write_json(_liked_file(), liked)
    return {'liked': True, 'count': len(liked)}


@router.delete('/{track_id}/like')
async def unlike_track(track_id: str):
    liked: list[str] = await _read_json(_liked_file(), [])
    liked = [i for i in liked if i != track_id]
    await _write_json(_liked_file(), liked)
    return {'liked': False, 'count': len(liked)}


@router.post('/{track_id}/play')
async def record_play(track_id: str):
    history: list[dict] = await _read_json(_history_file(), [])
    history = [h for h in history if h.get('id') != track_id]
    history.insert(0, {'id': track_id, 'playedAt': datetime.utcnow().isoformat()})
    history = history[:200]
    await _write_json(_history_file(), history)
    return {'ok': True}