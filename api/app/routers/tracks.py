from __future__ import annotations
from pathlib import Path
from fastapi import APIRouter, HTTPException
from app.core.config import settings
from app.services.metadata_service import read_track_metadata
from app.services.ytmusic_service import get_track as yt_get_track
from app.schemas.track import TrackSchema

router = APIRouter()


@router.get("/", response_model=list[TrackSchema])
async def list_tracks():
    """List all locally downloaded tracks."""
    music_dir = Path(settings.MUSIC_DIR)
    if not music_dir.exists():
        return []

    tracks = []
    for path in sorted(music_dir.rglob("*")):
        if path.suffix.lstrip(".") in ("mp3", "flac", "m4a", "ogg", "opus", "wav"):
            try:
                tracks.append(read_track_metadata(path))
            except Exception:
                continue
    return tracks


@router.get("/liked", response_model=list[TrackSchema])
async def get_liked():
    """Return liked tracks — stored in a simple JSON file."""
    import json
    liked_file = Path(settings.MUSIC_DIR) / ".liked.json"
    if not liked_file.exists():
        return []
    try:
        ids = json.loads(liked_file.read_text())
        return ids   # frontend handles hydration
    except Exception:
        return []


@router.get("/recently-played", response_model=list[TrackSchema])
async def get_recently_played():
    """Return recently played tracks from history log."""
    import json
    history_file = Path(settings.MUSIC_DIR) / ".history.json"
    if not history_file.exists():
        return []
    try:
        return json.loads(history_file.read_text())
    except Exception:
        return []


@router.get("/{track_id}", response_model=TrackSchema)
async def get_track(track_id: str):
    """
    Get a track by ID.
    First checks local library, then falls back to YouTube Music.
    """
    # Check local library
    music_dir = Path(settings.MUSIC_DIR)
    if music_dir.exists():
        for path in music_dir.rglob("*"):
            if path.suffix.lstrip(".") in ("mp3", "flac", "m4a", "ogg", "opus", "wav"):
                try:
                    t = read_track_metadata(path)
                    if t["id"] == track_id:
                        return t
                except Exception:
                    continue

    # Fall back to YouTube Music
    try:
        return await yt_get_track(track_id)
    except Exception:
        raise HTTPException(status_code=404, detail=f"Track not found: {track_id}")


@router.post("/{track_id}/like")
async def like_track(track_id: str):
    import json
    liked_file = Path(settings.MUSIC_DIR) / ".liked.json"
    liked: list = []
    if liked_file.exists():
        try:
            liked = json.loads(liked_file.read_text())
        except Exception:
            liked = []
    if track_id not in liked:
        liked.append(track_id)
    liked_file.write_text(json.dumps(liked))
    return {"liked": True}


@router.delete("/{track_id}/like")
async def unlike_track(track_id: str):
    import json
    liked_file = Path(settings.MUSIC_DIR) / ".liked.json"
    if not liked_file.exists():
        return {"liked": False}
    try:
        liked = json.loads(liked_file.read_text())
        liked = [i for i in liked if i != track_id]
        liked_file.write_text(json.dumps(liked))
    except Exception:
        pass
    return {"liked": False}


@router.post("/{track_id}/play")
async def record_play(track_id: str):
    """Record a play event to history."""
    import json
    from datetime import datetime
    history_file = Path(settings.MUSIC_DIR) / ".history.json"
    history: list = []
    if history_file.exists():
        try:
            history = json.loads(history_file.read_text())
        except Exception:
            history = []

    # Add to front, keep last 100, dedupe
    history = [h for h in history if h.get("id") != track_id]
    history.insert(0, {"id": track_id, "playedAt": datetime.utcnow().isoformat()})
    history = history[:100]
    history_file.write_text(json.dumps(history))
    return {"ok": True}