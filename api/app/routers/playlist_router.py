from __future__ import annotations
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.core.database import get_db
from app.schemas.playlist_schema import PlaylistSchema, CreatePlaylistSchema, UpdatePlaylistSchema

router = APIRouter()


@router.get("/", response_model=list[PlaylistSchema])
async def list_playlists(db: AsyncIOMotorDatabase = Depends(get_db)):
    cursor = db.playlists.find({"user_id": "anonymous"})
    return await cursor.to_list(length=200)


@router.get("/{playlist_id}", response_model=PlaylistSchema)
async def get_playlist(playlist_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    pl = await db.playlists.find_one({"_id": playlist_id, "user_id": "anonymous"})
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return pl


@router.post("/", response_model=PlaylistSchema, status_code=201)
async def create_playlist(req: CreatePlaylistSchema, db: AsyncIOMotorDatabase = Depends(get_db)):
    pl_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    pl = {
        "_id": pl_id,
        "user_id": "anonymous",
        "title": req.title,
        "description": req.description or "",
        "artworkUrl": None,
        "tracks": [],
        "trackCount": 0,
        "isLocal": True,
        "spotifyId": None,
        "createdAt": now,
        "updatedAt": now,
    }
    await db.playlists.insert_one(pl)
    return pl


@router.patch("/{playlist_id}", response_model=PlaylistSchema)
async def update_playlist(playlist_id: str, req: UpdatePlaylistSchema, db: AsyncIOMotorDatabase = Depends(get_db)):
    pl = await db.playlists.find_one({"_id": playlist_id, "user_id": "anonymous"})
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")
    updates: dict = {"updatedAt": datetime.now(timezone.utc).isoformat()}
    if req.title is not None:
        updates["title"] = req.title
    if req.description is not None:
        updates["description"] = req.description
    await db.playlists.update_one({"_id": playlist_id}, {"$set": updates})
    pl.update(updates)
    return pl


@router.delete("/{playlist_id}", status_code=204)
async def delete_playlist(playlist_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    await db.playlists.delete_one({"_id": playlist_id, "user_id": "anonymous"})


@router.post("/{playlist_id}/tracks")
async def add_track(playlist_id: str, body: dict, db: AsyncIOMotorDatabase = Depends(get_db)):
    track_id = body.get("trackId")
    if not track_id:
        raise HTTPException(status_code=400, detail="trackId required")
    pl = await db.playlists.find_one({"_id": playlist_id, "user_id": "anonymous"})
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")
    tracks = pl.get("tracks", [])
    if track_id not in tracks:
        tracks.append(track_id)
        await db.playlists.update_one(
            {"_id": playlist_id},
            {"$set": {"tracks": tracks, "trackCount": len(tracks), "updatedAt": datetime.now(timezone.utc).isoformat()}},
        )
    return {"ok": True}


@router.delete("/{playlist_id}/tracks/{track_id}")
async def remove_track(playlist_id: str, track_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    pl = await db.playlists.find_one({"_id": playlist_id, "user_id": "anonymous"})
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")
    tracks = [t for t in pl.get("tracks", []) if t != track_id]
    await db.playlists.update_one(
        {"_id": playlist_id},
        {"$set": {"tracks": tracks, "trackCount": len(tracks), "updatedAt": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True}


@router.post("/{playlist_id}/import")
async def import_spotify(playlist_id: str, body: dict, db: AsyncIOMotorDatabase = Depends(get_db)):
    """Import a Spotify playlist into a local playlist."""
    url = body.get("url", "")
    if not url:
        raise HTTPException(status_code=400, detail="url required")
    from app.services.search_service import resolve_url
    result = await resolve_url(url)
    tracks = result.get("tracks", [])
    pl = await db.playlists.find_one({"_id": playlist_id, "user_id": "anonymous"})
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")
    existing = pl.get("tracks", [])
    for t in tracks:
        tid = t.get("youtubeId") or t.get("id")
        if tid and tid not in existing:
            existing.append(tid)
    await db.playlists.update_one(
        {"_id": playlist_id},
        {"$set": {"tracks": existing, "trackCount": len(existing), "updatedAt": datetime.now(timezone.utc).isoformat()}},
    )
    return {"imported": len(tracks), "total": len(existing)}
