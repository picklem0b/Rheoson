"""Playlist router — file-based JSON storage with optional MongoDB sync.

Playlists are stored in MUSIC_DIR/.playlists.json (dict keyed by playlist ID).
Tracks are stored as a list of track IDs (strings), not embedded track objects.

When MongoDB is available, playlists are also synced there for multi-device access.
When MongoDB is unavailable (dev, self-hosted), file-based storage works standalone.
"""

from __future__ import annotations

import json
import uuid
import asyncio
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from app.core.config import settings
from app.core.database import db_available, get_db
from app.schemas.playlist_schema import PlaylistSchema, CreatePlaylistSchema, UpdatePlaylistSchema

router = APIRouter()

# ── File-based storage ─────────────────────────────────────────

_PLAYLISTS_FILE = Path(settings.MUSIC_DIR) / ".playlists.json"


def _load() -> dict[str, dict]:
    """Load playlists from the JSON file."""
    if not _PLAYLISTS_FILE.exists():
        return {}
    try:
        with open(_PLAYLISTS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            # Legacy format: convert list to dict
            return {p["id"]: p for p in data if "id" in p}
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, KeyError):
        return {}


def _save(data: dict[str, dict]) -> None:
    """Save playlists to the JSON file."""
    _PLAYLISTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(_PLAYLISTS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def _get_user_id(user=None) -> str:
    """Extract user ID from Clerk claims or default to 'anonymous'."""
    if user and isinstance(user, dict):
        return user.get("sub", "anonymous")
    return "anonymous"


def _stored_ids(pl: dict) -> list[str]:
    """Return the stored string track IDs, ignoring any legacy embedded objects."""
    out = []
    for t in (pl.get("tracks", []) or []):
        if isinstance(t, str):
            out.append(t)
        elif isinstance(t, dict):
            tid = t.get("id") or t.get("youtubeId") or t.get("videoId")
            if tid:
                out.append(str(tid))
    return out


def _summarize(pl: dict) -> dict:
    """Shape a playlist for grid/list responses.

    Stored track IDs travel as `trackIds`; the raw IDs are never returned in
    `tracks` because PlaylistSchema declares tracks: list[TrackSchema] and a
    list of plain strings would fail response validation (500). Only the
    detail endpoint hydrates tracks into full objects.
    """
    pl = dict(pl)
    ids = _stored_ids(pl)
    pl["tracks"] = []
    pl["trackIds"] = ids
    pl["trackCount"] = len(ids)
    return pl


# ── Routes ─────────────────────────────────────────────────────

@router.get("/", response_model=list[PlaylistSchema])
async def list_playlists(user=None):
    """List all playlists for the current user."""
    data = _load()
    user_id = _get_user_id(user)

    # Filter by user_id if present, otherwise return all (for anonymous)
    playlists = []
    for pl in data.values():
        pl_user = pl.get("user_id", "anonymous")
        if pl_user == user_id or user_id == "anonymous":
            playlists.append(pl)

    # Sort by updatedAt descending
    playlists.sort(key=lambda p: p.get("updatedAt", ""), reverse=True)
    return [_summarize(pl) for pl in playlists]


@router.get("/{playlist_id}", response_model=PlaylistSchema)
async def get_playlist(playlist_id: str, user=None):
    """Get a single playlist by ID."""
    data = _load()
    pl = data.get(playlist_id)
    
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")
    
    # Check ownership (skip for anonymous)
    user_id = _get_user_id(user)
    pl_user = pl.get("user_id", "anonymous")
    if user_id != "anonymous" and pl_user != user_id:
        raise HTTPException(status_code=404, detail="Playlist not found")

    # Hydrate the stored track IDs into full Track objects so the detail
    # page renders real artwork/titles/durations. Unhydratable IDs are
    # dropped from the response but kept in storage.
    from app.routers.track_router import _hydrate_many
    track_ids = [t for t in (pl.get("tracks", []) or []) if isinstance(t, str)]
    hydrated = await _hydrate_many(track_ids)

    pl = dict(pl)
    pl["trackIds"] = track_ids
    pl["tracks"] = hydrated
    pl["trackCount"] = len(hydrated)
    pl["totalDuration"] = sum(float(t.get("duration") or 0) for t in hydrated)
    return pl


@router.post("/", response_model=PlaylistSchema, status_code=201)
async def create_playlist(req: CreatePlaylistSchema, user=None):
    """Create a new playlist."""
    data = _load()
    user_id = _get_user_id(user)
    pl_id = str(uuid.uuid4())[:8]
    now = datetime.now(timezone.utc).isoformat()
    
    pl = {
        "id": pl_id,
        "_id": pl_id,
        "user_id": user_id,
        "title": req.title,
        "description": req.description or "",
        "artworkUrl": None,
        "tracks": [],
        "trackIds": [],
        "trackCount": 0,
        "isLocal": True,
        "spotifyId": None,
        "createdAt": now,
        "updatedAt": now,
    }
    
    data[pl_id] = pl
    _save(data)
    
    # Sync to MongoDB if available
    if db_available():
        try:
            db = get_db()
            await db.playlists.update_one(
                {"_id": pl_id},
                {"$set": pl},
                upsert=True,
            )
        except Exception:
            pass  # File storage is primary; MongoDB sync is best-effort
    
    return pl


@router.patch("/{playlist_id}", response_model=PlaylistSchema)
async def update_playlist(playlist_id: str, req: UpdatePlaylistSchema, user=None):
    """Update playlist title/description/artwork."""
    data = _load()
    pl = data.get(playlist_id)

    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")

    user_id = _get_user_id(user)
    pl_user = pl.get("user_id", "anonymous")
    if user_id != "anonymous" and pl_user != user_id:
        raise HTTPException(status_code=404, detail="Playlist not found")

    now = datetime.now(timezone.utc).isoformat()
    if req.title is not None:
        pl["title"] = req.title
    if req.description is not None:
        pl["description"] = req.description
    if req.artworkUrl:
        pl["artworkUrl"] = req.artworkUrl
    pl["updatedAt"] = now

    data[playlist_id] = pl
    _save(data)

    # Sync to MongoDB if available — store a clean copy with normalized tracks
    if db_available():
        try:
            db = get_db()
            mongo_pl = dict(pl)
            mongo_pl["tracks"] = _stored_ids(pl)
            mongo_pl["trackIds"] = _stored_ids(pl)
            mongo_pl["trackCount"] = len(_stored_ids(pl))
            await db.playlists.update_one(
                {"_id": playlist_id},
                {"$set": mongo_pl},
                upsert=True,
            )
        except Exception:
            pass

    # Response must match PlaylistSchema — never return raw stored string IDs
    return _summarize(pl)


@router.delete("/{playlist_id}", status_code=204)
async def delete_playlist(playlist_id: str, user=None):
    """Delete a playlist.

    Idempotent: deleting a playlist that no longer exists is a success (204).
    The frontend queues deletions for offline sync and replays them later — a
    404 on replay would surface as a spurious sync error.
    """
    data = _load()
    pl = data.get(playlist_id)

    user_id = _get_user_id(user)
    if pl is not None:
        pl_user = pl.get("user_id", "anonymous")
        if user_id != "anonymous" and pl_user != user_id:
            raise HTTPException(status_code=404, detail="Playlist not found")
        del data[playlist_id]
        _save(data)

    # Sync to MongoDB if available (no-op if the doc is already gone)
    if db_available():
        try:
            db = get_db()
            await db.playlists.delete_one({"_id": playlist_id})
        except Exception:
            pass


@router.post("/{playlist_id}/tracks")
async def add_track(playlist_id: str, body: dict, user=None):
    """Add a track to a playlist."""
    track_id = body.get("trackId")
    if not track_id:
        raise HTTPException(status_code=400, detail="trackId required")

    data = _load()
    pl = data.get(playlist_id)

    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")

    tracks = _stored_ids(pl)

    # Deduplicate — don't add the same track twice
    if track_id in tracks:
        return {"ok": True, "message": "Track already in playlist"}

    tracks.append(track_id)
    pl["tracks"] = tracks
    pl["trackIds"] = tracks
    pl["trackCount"] = len(tracks)
    pl["updatedAt"] = datetime.now(timezone.utc).isoformat()

    data[playlist_id] = pl
    _save(data)

    # Sync to MongoDB if available
    if db_available():
        try:
            db = get_db()
            await db.playlists.update_one(
                {"_id": playlist_id},
                {"$set": {"tracks": tracks, "trackIds": tracks, "trackCount": len(tracks), "updatedAt": pl["updatedAt"]}},
            )
        except Exception:
            pass

    return {"ok": True}


@router.delete("/{playlist_id}/tracks/{track_id}")
async def remove_track(playlist_id: str, track_id: str, user=None):
    """Remove a track from a playlist."""
    data = _load()
    pl = data.get(playlist_id)

    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")

    tracks = [t for t in _stored_ids(pl) if t != track_id]
    pl["tracks"] = tracks
    pl["trackIds"] = tracks
    pl["trackCount"] = len(tracks)
    pl["updatedAt"] = datetime.now(timezone.utc).isoformat()

    data[playlist_id] = pl
    _save(data)

    # Sync to MongoDB if available
    if db_available():
        try:
            db = get_db()
            await db.playlists.update_one(
                {"_id": playlist_id},
                {"$set": {"tracks": tracks, "trackIds": tracks, "trackCount": len(tracks), "updatedAt": pl["updatedAt"]}},
            )
        except Exception:
            pass

    return {"ok": True}


@router.put("/{playlist_id}/tracks/reorder")
async def reorder_tracks(playlist_id: str, body: dict, user=None):
    """Reorder tracks in a playlist."""
    track_ids = body.get("trackIds", [])
    if not isinstance(track_ids, list) or not all(isinstance(t, str) for t in track_ids):
        raise HTTPException(status_code=400, detail="trackIds must be a list of strings")

    data = _load()
    pl = data.get(playlist_id)

    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")

    pl["tracks"] = track_ids
    pl["trackIds"] = track_ids
    pl["trackCount"] = len(track_ids)
    pl["updatedAt"] = datetime.now(timezone.utc).isoformat()

    data[playlist_id] = pl
    _save(data)

    return {"ok": True}


@router.post("/{playlist_id}/import")
async def import_spotify(playlist_id: str, body: dict, user=None):
    """Import a Spotify playlist into a local playlist."""
    url = body.get("url", "")
    if not url:
        raise HTTPException(status_code=400, detail="url required")
    
    from app.services.search_service import resolve_url
    result = await resolve_url(url)
    tracks = result.get("tracks", [])
    
    data = _load()
    pl = data.get(playlist_id)
    
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")
    
    existing = [t for t in (pl.get("tracks", []) or []) if isinstance(t, str)]
    for t in tracks:
        tid = t.get("youtubeId") or t.get("id")
        if tid and tid not in existing:
            existing.append(tid)
    
    pl["tracks"] = existing
    pl["trackIds"] = existing
    pl["trackCount"] = len(existing)
    pl["updatedAt"] = datetime.now(timezone.utc).isoformat()
    
    data[playlist_id] = pl
    _save(data)
    
    return {"imported": len(tracks), "total": len(existing)}


class ImportPlaylistRequest(BaseModel):
    url: str
    title: str | None = None


@router.post("/import", response_model=PlaylistSchema, status_code=201)
async def import_playlist_url(req: ImportPlaylistRequest):
    """Create a new playlist from a shared URL (Spotify/YouTube/SoundCloud…).

    Resolves the URL server-side and stores the resolved track IDs in a
    brand-new playlist. This backs the Library "Import playlist" flow.
    """
    url = (req.url or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="url required")
    if len(url) > 2048:
        raise HTTPException(status_code=400, detail="URL too long")
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Invalid URL format")

    try:
        from app.services.search_service import resolve_url
        result = await resolve_url(url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not resolve URL: {e}") from e

    tracks = result.get("tracks", [])
    if not tracks:
        raise HTTPException(status_code=400, detail="No playable tracks found at that URL")

    ids: list[str] = []
    for t in tracks:
        tid = t.get("youtubeId") or t.get("id")
        if tid and tid not in ids:
            ids.append(str(tid))
    if not ids:
        raise HTTPException(status_code=400, detail="No playable tracks found at that URL")

    playlists = result.get("playlists") or []
    source_title = ""
    if playlists and isinstance(playlists[0], dict):
        source_title = playlists[0].get("title") or playlists[0].get("name") or ""
    title = (req.title or source_title or "Imported playlist").strip()[:120] or "Imported playlist"

    data = _load()
    pl_id = str(uuid.uuid4())[:8]
    now = datetime.now(timezone.utc).isoformat()
    user_id = _get_user_id(None)
    pl = {
        "id": pl_id,
        "_id": pl_id,
        "user_id": user_id,
        "title": title,
        "description": "",
        "artworkUrl": None,
        "tracks": ids,
        "trackIds": ids,
        "trackCount": len(ids),
        "isLocal": True,
        "spotifyId": None,
        "createdAt": now,
        "updatedAt": now,
    }
    data[pl_id] = pl
    _save(data)

    if db_available():
        try:
            db = get_db()
            await db.playlists.update_one(
                {"_id": pl_id},
                {"$set": dict(pl)},
                upsert=True,
            )
        except Exception:
            pass

    return _summarize(pl)


@router.get("/{playlist_id}/export")
async def export_playlist(playlist_id: str, user=None):
    """Export playlist as JSON with hydrated track metadata."""
    data = _load()
    pl = data.get(playlist_id)
    
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")
    
    from app.routers.track_router import _hydrate_track

    track_ids = _stored_ids(pl)
    sem = asyncio.Semaphore(10)
    
    async def _safe(tid: str):
        async with sem:
            return await _hydrate_track(tid)
    
    hydrated = await asyncio.gather(*[_safe(tid) for tid in track_ids])
    tracks = [t for t in hydrated if t is not None]
    
    return {
        "title": pl.get("title", ""),
        "description": pl.get("description", ""),
        "trackCount": len(tracks),
        "tracks": tracks,
        "exportedAt": datetime.now(timezone.utc).isoformat(),
    }
