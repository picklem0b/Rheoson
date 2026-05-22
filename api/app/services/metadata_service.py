import hashlib
from pathlib import Path

from mutagen import File as MutagenFile

from app.schemas.track import Track


def _stable_id(title: str, artist: str) -> str:
    """
    ID based on title + artist so it never changes
    even if the file moves or gets renamed.
    """
    raw = f"{artist.lower().strip()}::{title.lower().strip()}"
    return hashlib.md5(raw.encode()).hexdigest()[:12]


def read_track_metadata(path: Path) -> Track:
    audio = MutagenFile(path, easy=True)
    tags  = audio.tags or {}

    title  = tags.get("title",  [path.stem])[0]
    artist = tags.get("artist", ["Unknown Artist"])[0]

    return Track(
        id       = _stable_id(title, artist),
        title    = title,
        artist   = artist,
        album    = tags.get("album",  ["Unknown Album"])[0],
        duration = int(audio.info.length) if audio.info else 0,
        path     = str(path),
        genre    = tags.get("genre",  [None])[0],
        year     = int(tags.get("date", ["0"])[0][:4]) if tags.get("date") else None,
    )