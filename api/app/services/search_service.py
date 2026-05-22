from pathlib import Path
from app.core.config import settings
from app.services.metadata_service import read_track_metadata
from app.schemas.track import Track


def search_library(query: str) -> list[Track]:
    q = query.lower()
    results: list[Track] = []
    music_dir = Path(settings.MUSIC_DIR)
    for path in music_dir.rglob("*"):
        if path.suffix.lstrip(".") in ("mp3", "flac", "m4a", "ogg", "opus"):
            try:
                track = read_track_metadata(path)
                if q in track.title.lower() or q in track.artist.lower() or q in track.album.lower():
                    results.append(track)
            except Exception:
                continue
    return results
