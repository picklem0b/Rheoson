from __future__ import annotations
import hashlib
import os
import structlog
from pathlib import Path
from mutagen import File as MutagenFile
from mutagen.id3 import ID3, TIT2, TPE1, TALB, TRCK, APIC, TDRC, USLT
from mutagen.mp4 import MP4, MP4Cover
from mutagen.flac import FLAC, Picture
from mutagen.oggvorbis import OggVorbis

log = structlog.get_logger()

# API origin used to build absolute URLs for artworkUrl and streamUrl.
# These fields end up in JSON responses consumed by the frontend.
# When the frontend and API are on different origins (e.g. Rheoson-web.onrender.com
# and Rheoson-api-vnny.onrender.com), relative paths like /api/stream/...
# would be resolved against the FRONTEND origin and 404.
# The frontend's API_BASE handles this for fetch() calls but <img src> and
# Howler's src property use the raw string — so it must be absolute.
#
# On Render: set API_BASE_URL=https://Rheoson-api-vnny.onrender.com in env vars.
# On Termux: leave unset — relative paths work when frontend and API are same origin.
_API_ORIGIN = os.environ.get("API_BASE_URL", "").rstrip("/")


def _abs(path: str) -> str:
    """Make an API path absolute if API_BASE_URL is set, else leave relative."""
    return f"{_API_ORIGIN}{path}" if _API_ORIGIN else path


def _file_id(path: Path) -> str:
    """Deterministic ID from file path — stable across restarts."""
    return hashlib.md5(str(path).encode()).hexdigest()[:16]


def read_track_metadata(path: Path) -> dict:
    """Read ID3/vorbis tags from a local file → TrackSchema-compatible dict."""
    suffix    = path.suffix.lower()
    title     = path.stem
    artist    = "Unknown Artist"
    album     = "Unknown Album"
    year      = 0
    track_num = 0
    duration  = 0.0

    try:
        f = MutagenFile(path, easy=True)
        if f:
            title  = str(f.get("title",  [path.stem])[0])
            artist = str(f.get("artist", ["Unknown Artist"])[0])
            album  = str(f.get("album",  ["Unknown Album"])[0])
            try:
                year = int(str(f.get("date", [0])[0])[:4])
            except (ValueError, TypeError):
                year = 0
            try:
                track_num = int(str(f.get("tracknumber", [0])[0]).split("/")[0])
            except (ValueError, TypeError):
                track_num = 0
        duration = f.info.length if f and f.info else 0.0
    except Exception as e:
        log.warning("metadata.read.failed", path=str(path), error=str(e))

    file_id    = _file_id(path)
    stream_url = _abs(f"/api/stream/{file_id}/audio")
    artwork_url = _abs(f"/api/stream/{file_id}/artwork")

    artist_id = hashlib.md5(artist.encode()).hexdigest()[:8]
    album_id  = hashlib.md5(album.encode()).hexdigest()[:8]

    return {
        "id":           file_id,
        "title":        title,
        "duration":     duration,
        "artworkUrl":   artwork_url,
        "youtubeId":    None,
        "spotifyId":    None,
        "isDownloaded": True,
        "isLiked":      False,
        "filePath":     str(path),
        "streamUrl":    stream_url,
        "artist": {
            "id":       artist_id,
            "name":     artist,
            "imageUrl": None,
            "genres":   [],
        },
        "album": {
            "id":          album_id,
            "title":       album,
            "artworkUrl":  artwork_url,
            "releaseYear": year,
            "trackCount":  0,
            "artist": {
                "id":       artist_id,
                "name":     artist,
                "imageUrl": None,
                "genres":   [],
            },
        },
    }


def extract_artwork_bytes(path: Path) -> bytes | None:
    """Extract embedded artwork bytes from a local audio file."""
    try:
        suffix = path.suffix.lower()
        if suffix == ".mp3":
            tags = ID3(path)
            for tag in tags.values():
                if isinstance(tag, APIC):
                    return tag.data
        elif suffix in (".m4a", ".mp4", ".aac"):
            tags = MP4(path)
            covers = tags.get("covr", [])
            if covers:
                return bytes(covers[0])
        elif suffix == ".flac":
            f = FLAC(path)
            if f.pictures:
                return f.pictures[0].data
        elif suffix in (".ogg", ".opus"):
            f = MutagenFile(path)
            if hasattr(f, "tags") and f.tags:
                for val in f.tags.values():
                    if isinstance(val, list):
                        for item in val:
                            if hasattr(item, "data"):
                                return item.data
    except Exception as e:
        log.debug("metadata.artwork.failed", path=str(path), error=str(e))
    return None