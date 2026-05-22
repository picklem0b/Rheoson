from pathlib import Path

from fastapi import HTTPException
from fastapi.responses import FileResponse

from app.core.config import settings
from app.services.metadata_service import read_track_metadata, _stable_id


AUDIO_EXTENSIONS = ("mp3", "flac", "m4a", "ogg", "opus", "webm")

MIME = {
    "mp3":  "audio/mpeg",
    "flac": "audio/flac",
    "m4a":  "audio/mp4",
    "ogg":  "audio/ogg",
    "opus": "audio/opus",
    "webm": "audio/webm",
}


def _all_tracks(music_dir: Path):
    """Recursively yield every audio file under music_dir."""
    for ext in AUDIO_EXTENSIONS:
        yield from music_dir.rglob(f"*.{ext}")


def resolve_track_path(track_id: str) -> Path:
    """
    Walk the entire music directory tree and find the file
    whose stable ID (md5 of artist::title) matches track_id.
    """
    music_dir = Path(settings.MUSIC_DIR)

    for path in _all_tracks(music_dir):
        try:
            track = read_track_metadata(path)
            if track.id == track_id:
                return path
        except Exception:
            continue

    raise HTTPException(status_code=404, detail=f"Track {track_id!r} not found")


def resolve_artwork_path(track_id: str) -> Path | None:
    """Same lookup — returns path so artwork endpoint can extract embedded art."""
    try:
        return resolve_track_path(track_id)
    except HTTPException:
        return None


def stream_response(path: Path) -> FileResponse:
    ext  = path.suffix.lstrip(".")
    mime = MIME.get(ext, "application/octet-stream")
    return FileResponse(
        path,
        media_type=mime,
        headers={"Accept-Ranges": "bytes"},
    )