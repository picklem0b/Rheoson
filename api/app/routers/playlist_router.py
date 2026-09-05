"""Playlist router — per-user JSON storage with optional MongoDB sync.

Guest mode is removed: every route requires a verified Clerk session and all
playlists are scoped to `user["sub"]`. File storage lives in one JSON file
per user (MUSIC_DIR/.playlists-<sha256(sub)[:16]>.json) so one user can
never read or mutate another user's playlists even in no-Mongo mode. When
MongoDB is available, playlists are also synced there for multi-device
access (each doc carries its user_id and ownership is enforced on reads).

Tracks are stored as a list of track IDs (strings), not embedded track
objects. The library file index behind those IDs is intentionally shared
instance state (all authorized users play the same downloaded library).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.config import settings
from app.core.database import db_available, get_db
from app.core.deps import get_current_user
from app.schemas.playlist_schema import PlaylistSchema, CreatePlaylistSchema, UpdatePlaylistSchema

router = APIRouter()

# ── Per-user file storage ─────────────────────────────────────


def _user_digest(user_id: str) -> str:
    return hashlib.sha256(user_id.encode("utf-8")).hexdigest()[:16]


def _user_file(user_id: str) -> Path:
    return Path(settings.MUSIC_DIR) / f".playlists-{_user_digest(user_id)}.json"


def _load(user_id: str) -> dict[str, dict]:
    """Load the current user's playlists from their JSON file."""
    path = _user_file(user_id)
    if not path.exists():
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            # Legacy format: convert list to dict
            return {p["id"]: p for p in data if isinstance(p, dict) and "id" in p}
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, KeyError):
        return {}


def _save(user_id: str, data: dict[str, dict]) -> None:
    """Save the current user's playlists to their JSON file."""
    path = _user_file(user_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


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


def _new_playlist(user_id: str, title: str, description: str, tracks: list[str]) -> dict:
    pl_id = str(uuid.uuid4())[:8]
    now = datetime.now(timezone.utc).isoformat()
    return {
        "id": pl_id,
        "_id": pl_id,
        "user_id": user_id,
        "title": title,
        "description": description,
        "artworkUrl": None,
        "tracks": tracks,
        "trackIds": tracks,
        "trackCount": len(tracks),
        "isLocal": True,
        "spotifyId": None,
        "createdAt": now,
        "updatedAt": now,
    }


async def _sync_mongo(pl: dict) -> None:
    """Best-effort upsert of one playlist into Mongo (file store is primary)."""
    if not db_available():
        return
    try:
        db = get_db()
        mongo_pl = dict(pl)
        mongo_pl["tracks"] = _stored_ids(pl)
        mongo_pl["trackIds"] = _stored_ids(pl)
        mongo_pl["trackCount"] = len(_stored_ids(pl))
        await db.playlists.update_one({"_id": pl["id"]}, {"$set": mongo_pl}, upsert=True)
    except Exception:
        pass


async def _remove_mongo(playlist_id: str) -> None:
    if not db_available():
        return
    try:
        await get_db().playlists.delete_one({"_id": playlist_id})
    except Exception:
        pass


# ── Routes ─────────────────────────────────────────────────────

@router.get("/", response_model=list[PlaylistSchema])
async def list_playlists(user: dict = Depends(get_current_user)):
    """List the current user's playlists, most recently updated first."""
    data = _load(user["sub"])
    playlists = sorted(data.values(), key=lambda p: p.get("updatedAt", ""), reverse=True)
    return [_summarize(pl) for pl in playlists]


class ImportPlaylistRequest(BaseModel):
    url: str
    title: str | None = None


@router.post("/import", response_model=PlaylistSchema, status_code=201)
async def import_playlist_url(
    req: ImportPlaylistRequest,
    user: dict = Depends(get_current_user),
):
    """Create a new playlist from a shared URL (Spotify/YouTube/SoundCloud…)."""
    url = (req.url or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="url required")
    if len(url) > 2048:
        raise HTTPException(status_code=400, detail="URL too long")
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Invalid URL format")

    from app.services.netguard import ensure_safe_media_url
    try:
        ensure_safe_media_url(url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

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

    user_id = user["sub"]
    data = _load(user_id)
    pl = _new_playlist(user_id, title, "", ids)
    data[pl["id"]] = pl
    _save(user_id, data)
    await _sync_mongo(pl)
    return _summarize(pl)


@router.get("/{playlist_id}", response_model=PlaylistSchema)
async def get_playlist(playlist_id: str, user: dict = Depends(get_current_user)):
    """Get one playlist with fully hydrated track objects."""
    data = _load(user["sub"])
    pl = data.get(playlist_id)
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")

    # Hydrate the stored track IDs into full Track objects. Unhydratable IDs
    # are dropped from the response but kept in storage.
    from app.routers.track_router import _hydrate_many
    track_ids = _stored_ids(pl)
    hydrated = await _hydrate_many(track_ids)

    pl = dict(pl)
    pl["trackIds"] = track_ids
    pl["tracks"] = hydrated
    pl["trackCount"] = len(hydrated)
    pl["totalDuration"] = sum(float(t.get("duration") or 0) for t in hydrated)
    return pl


@router.post("/", response_model=PlaylistSchema, status_code=201)
async def create_playlist(
    req: CreatePlaylistSchema,
    user: dict = Depends(get_current_user),
):
    user_id = user["sub"]
    data = _load(user_id)
    pl = _new_playlist(user_id, req.title, req.description or "", [])
    data[pl["id"]] = pl
    _save(user_id, data)
    await _sync_mongo(pl)
    return pl


@router.patch("/{playlist_id}", response_model=PlaylistSchema)
async def update_playlist(
    playlist_id: str,
    req: UpdatePlaylistSchema,
    user: dict = Depends(get_current_user),
):
    """Update playlist title/description/artwork."""
    user_id = user["sub"]
    data = _load(user_id)
    pl = data.get(playlist_id)
    if not pl:
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
    _save(user_id, data)
    await _sync_mongo(pl)

    # Response must match PlaylistSchema — never return raw stored string IDs
    return _summarize(pl)


@router.delete("/{playlist_id}", status_code=204)
async def delete_playlist(playlist_id: str, user: dict = Depends(get_current_user)):
    """Delete a playlist.

    Idempotent: deleting a playlist that no longer exists is a success (204).
    The frontend queues deletions for offline sync and replays them later — a
    404 on replay would surface as a spurious sync error.
    """
    user_id = user["sub"]
    data = _load(user_id)
    if playlist_id in data:
        del data[playlist_id]
        _save(user_id, data)
    await _remove_mongo(playlist_id)


@router.post("/{playlist_id}/tracks")
async def add_track(
    playlist_id: str,
    body: dict,
    user: dict = Depends(get_current_user),
):
    """Add a track to a playlist."""
    track_id = body.get("trackId")
    if not track_id:
        raise HTTPException(status_code=400, detail="trackId required")

    user_id = user["sub"]
    data = _load(user_id)
    pl = data.get(playlist_id)
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")

    tracks = _stored_ids(pl)
    if track_id in tracks:
        return {"ok": True, "message": "Track already in playlist"}

    tracks.append(track_id)
    pl["tracks"] = tracks
    pl["trackIds"] = tracks
    pl["trackCount"] = len(tracks)
    pl["updatedAt"] = datetime.now(timezone.utc).isoformat()
    data[playlist_id] = pl
    _save(user_id, data)
    await _sync_mongo(pl)
    return {"ok": True}


@router.delete("/{playlist_id}/tracks/{track_id}")
async def remove_track(
    playlist_id: str,
    track_id: str,
    user: dict = Depends(get_current_user),
):
    """Remove a track from a playlist."""
    user_id = user["sub"]
    data = _load(user_id)
    pl = data.get(playlist_id)
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")

    tracks = [t for t in _stored_ids(pl) if t != track_id]
    pl["tracks"] = tracks
    pl["trackIds"] = tracks
    pl["trackCount"] = len(tracks)
    pl["updatedAt"] = datetime.now(timezone.utc).isoformat()
    data[playlist_id] = pl
    _save(user_id, data)
    await _sync_mongo(pl)
    return {"ok": True}


@router.put("/{playlist_id}/tracks/reorder")
async def reorder_tracks(
    playlist_id: str,
    body: dict,
    user: dict = Depends(get_current_user),
):
    """Reorder tracks in a playlist."""
    track_ids = body.get("trackIds", [])
    if not isinstance(track_ids, list) or not all(isinstance(t, str) for t in track_ids):
        raise HTTPException(status_code=400, detail="trackIds must be a list of strings")

    user_id = user["sub"]
    data = _load(user_id)
    pl = data.get(playlist_id)
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")

    pl["tracks"] = track_ids
    pl["trackIds"] = track_ids
    pl["trackCount"] = len(track_ids)
    pl["updatedAt"] = datetime.now(timezone.utc).isoformat()
    data[playlist_id] = pl
    _save(user_id, data)
    await _sync_mongo(pl)
    return {"ok": True}


@router.post("/{playlist_id}/import")
async def import_into_playlist(
    playlist_id: str,
    body: dict,
    user: dict = Depends(get_current_user),
):
    """Import tracks from a shared URL into an existing playlist."""
    url = body.get("url", "")
    if not url:
        raise HTTPException(status_code=400, detail="url required")

    from app.services.netguard import ensure_safe_media_url
    try:
        ensure_safe_media_url(url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    from app.services.search_service import resolve_url
    try:
        result = await resolve_url(url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not resolve URL: {e}") from e

    tracks = result.get("tracks", [])
    user_id = user["sub"]
    data = _load(user_id)
    pl = data.get(playlist_id)
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")

    existing = _stored_ids(pl)
    for t in tracks:
        tid = t.get("youtubeId") or t.get("id")
        if tid and tid not in existing:
            existing.append(tid)

    pl["tracks"] = existing
    pl["trackIds"] = existing
    pl["trackCount"] = len(existing)
    pl["updatedAt"] = datetime.now(timezone.utc).isoformat()
    data[playlist_id] = pl
    _save(user_id, data)
    await _sync_mongo(pl)
    return {"imported": len(tracks), "total": len(existing)}


@router.get("/{playlist_id}/export")
async def export_playlist(playlist_id: str, user: dict = Depends(get_current_user)):
    """Export playlist as JSON with hydrated track metadata."""
    data = _load(user["sub"])
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
