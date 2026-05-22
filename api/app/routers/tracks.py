from pathlib import Path

from fastapi import APIRouter

from app.core.config import settings
from app.schemas.track import Track, TrackList
from app.services.metadata_service import read_track_metadata

router = APIRouter()

AUDIO_EXTENSIONS = ("mp3", "flac", "m4a", "ogg", "opus", "webm")


@router.get("/", response_model=TrackList)
async def list_tracks(skip: int = 0, limit: int = 200):
    music_dir = Path(settings.MUSIC_DIR)
    tracks: list[Track] = []

    for ext in AUDIO_EXTENSIONS:
        for path in sorted(music_dir.rglob(f"*.{ext}")):
            try:
                tracks.append(read_track_metadata(path))
            except Exception:
                continue

    # deduplicate by id in case same track exists in multiple formats
    seen: set[str] = set()
    unique: list[Track] = []
    for t in tracks:
        if t.id not in seen:
            seen.add(t.id)
            unique.append(t)

    return TrackList(tracks=unique[skip: skip + limit], total=len(unique))


@router.get("/{track_id}", response_model=Track)
async def get_track(track_id: str):
    from app.core.exceptions import TrackNotFound
    music_dir = Path(settings.MUSIC_DIR)

    for ext in AUDIO_EXTENSIONS:
        for path in music_dir.rglob(f"*.{ext}"):
            try:
                track = read_track_metadata(path)
                if track.id == track_id:
                    return track
            except Exception:
                continue

    raise TrackNotFound(track_id)