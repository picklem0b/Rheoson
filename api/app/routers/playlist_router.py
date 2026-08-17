from __future__ import annotations
import json
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, HTTPException
from app.core.config import settings
from app.schemas.playlist_schema import PlaylistSchema, CreatePlaylistSchema, UpdatePlaylistSchema

router = APIRouter()

# Store playlists as a JSON file in MUSIC_DIR
def _pl_file() -> Path:
    return Path(settings.MUSIC_DIR) / ".playlists.json"


def _load() -> dict[str, dict]:
    f = _pl_file()
    if not f.exists():
        return {}
    try:
        return json.loads(f.read_text())
    except Exception:
        return {}


def _save(data: dict) -> None:
    _pl_file().parent.mkdir(parents=True, exist_ok=True)
    _pl_file().write_text(json.dumps(data, indent=2))


@router.get("/", response_model=list[PlaylistSchema])
async def list_playlists():
    return list(_load().values())


@router.get("/{playlist_id}", response_model=PlaylistSchema)
async def get_playlist(playlist_id: str):
    data = _load()
    if playlist_id not in data:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return data[playlist_id]


@router.post("/", response_model=PlaylistSchema, status_code=201)
async def create_playlist(req: CreatePlaylistSchema):
    import uuid
    data = _load()
    pl   = {
        "id":          str(uuid.uuid4()),
        "title":       req.title,
        "description": req.description or "",
        "artworkUrl":  None,
        "tracks":      [],
        "trackCount":  0,
        "isLocal":     True,
        "spotifyId":   None,
        "createdAt":   datetime.utcnow().isoformat(),
        "updatedAt":   datetime.utcnow().isoformat(),
    }
    data[pl["id"]] = pl
    _save(data)
    return pl


@router.patch("/{playlist_id}", response_model=PlaylistSchema)
async def update_playlist(playlist_id: str, req: UpdatePlaylistSchema):
    data = _load()
    if playlist_id not in data:
        raise HTTPException(status_code=404, detail="Playlist not found")
    pl = data[playlist_id]
    if req.title       is not None: pl["title"]       = req.title
    if req.description is not None: pl["description"] = req.description
    pl["updatedAt"] = datetime.utcnow().isoformat()
    _save(data)
    return pl


@router.delete("/{playlist_id}", status_code=204)
async def delete_playlist(playlist_id: str):
    data = _load()
    if playlist_id not in data:
        raise HTTPException(status_code=404, detail="Playlist not found")
    del data[playlist_id]
    _save(data)


@router.post("/{playlist_id}/tracks")
async def add_track(playlist_id: str, body: dict):
    track_id = body.get("trackId")
    if not track_id:
        raise HTTPException(status_code=400, detail="trackId required")
    data = _load()
    if playlist_id not in data:
        raise HTTPException(status_code=404, detail="Playlist not found")
    pl = data[playlist_id]
    if track_id not in pl["tracks"]:
        pl["tracks"].append(track_id)
        pl["trackCount"] = len(pl["tracks"])
        pl["updatedAt"]  = datetime.utcnow().isoformat()
    _save(data)
    return {"ok": True}


@router.delete("/{playlist_id}/tracks/{track_id}")
async def remove_track(playlist_id: str, track_id: str):
    data = _load()
    if playlist_id not in data:
        raise HTTPException(status_code=404, detail="Playlist not found")
    pl = data[playlist_id]
    pl["tracks"]     = [t for t in pl["tracks"] if t != track_id]
    pl["trackCount"] = len(pl["tracks"])
    pl["updatedAt"]  = datetime.utcnow().isoformat()
    _save(data)
    return {"ok": True}


@router.post("/{playlist_id}/import")
async def import_spotify(playlist_id: str, body: dict):
    """Import a Spotify playlist into a local playlist."""
    url = body.get("url", "")
    if not url:
        raise HTTPException(status_code=400, detail="url required")
    from app.services.search_service import resolve_url
    result = await resolve_url(url)
    tracks = result.get("tracks", [])
    data   = _load()
    if playlist_id not in data:
        raise HTTPException(status_code=404, detail="Playlist not found")
    pl = data[playlist_id]
    for t in tracks:
        tid = t.get("youtubeId") or t.get("id")
        if tid and tid not in pl["tracks"]:
            pl["tracks"].append(tid)
    pl["trackCount"] = len(pl["tracks"])
    pl["updatedAt"]  = datetime.utcnow().isoformat()
    _save(data)
    return {"imported": len(tracks), "total": pl["trackCount"]}