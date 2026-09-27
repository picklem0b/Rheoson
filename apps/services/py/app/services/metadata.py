"""Tag reading and writing — the engine's view of a local file.

Two things here are contracts, not implementation details:

* ``file_id`` — ``MD5(str(path))[:16]``. Every stored artwork/stream URL on the
  current stack is keyed by it. Changing the recipe breaks every one of them.
* ``read_track_metadata`` returns a dict shaped like the shared ``Track`` type,
  with artist/album names rather than ids, so the library can build ids from the
  names it already has.

mutagen is imported defensively: on a host without it the engine still resolves
and streams, it just cannot read or write tags. That keeps ``pip install
mutagen`` a capability upgrade instead of a boot requirement.
"""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Optional

import structlog

try:  # pragma: no cover - presence depends on the host
    from mutagen import File as MutagenFile
    from mutagen.flac import FLAC, Picture
    from mutagen.id3 import APIC, ID3, TALB, TDRC, TIT2, TPE1, TRCK
    from mutagen.mp4 import MP4, MP4Cover
    from mutagen.wave import WAVE

    MUTAGEN_AVAILABLE = True
except Exception:  # noqa: BLE001 - a missing tag library is not a broken engine
    MutagenFile = None  # type: ignore[assignment]
    MUTAGEN_AVAILABLE = False

log = structlog.get_logger()

#: Extensions the library scans. Matches the current stack's set, so a music
#: directory produces the same list in both apps during the parity run.
AUDIO_EXTENSIONS = {
    ".mp3",
    ".m4a",
    ".mp4",
    ".aac",
    ".flac",
    ".ogg",
    ".oga",
    ".opus",
    ".wav",
    ".weba",
    ".webm",
}

#: Extension of the image a download leaves beside its audio.
ARTWORK_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

#: Easy-tag key → the ID3 frame a RIFF-container file stores it as.
_ID3_FRAME_FOR_EASY = {
    "title": "TIT2",
    "artist": "TPE1",
    "albumartist": "TPE2",
    "performer": "TPE1",
    "album": "TALB",
    "date": "TDRC",
    "year": "TDRC",
    "originaldate": "TDOR",
    "tracknumber": "TRCK",
}

MIME_BY_IMAGE_EXT = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}


def abs_path(path: str | Path) -> str:
    """Absolute, symlink-resolved path. The file id is built from this, so it
    must be stable no matter how the caller spelled the path."""
    return str(Path(path).expanduser().resolve())


def file_id(path: str | Path) -> str:
    """Deterministic id from a file path — stable across restarts.

    This is the local-track identity contract: ``MD5(str(path))[:16]``.
    """
    return hashlib.md5(abs_path(path).encode()).hexdigest()[:16]


def image_mime(data: bytes, fallback: str = "image/jpeg") -> str:
    """Sniff an image's mime from its magic bytes, falling back to the hint.

    Embedded artwork carries no filename, so the header is what is left.
    """
    if data[:3] == b"\xff\xd8\xff" or data[:2] == b"\xff\xd8":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return fallback


# ── Read ──────────────────────────────────────────────────────


def read_track_metadata(path: Path | str) -> dict:
    """Read tags from a local file → Track-shaped dict.

    Never raises: an unreadable or untagged file still yields a usable record
    built from its filename, which is how a hand-copied library stays playable.
    """
    p = Path(path)
    title = p.stem
    artist = "Unknown Artist"
    album = "Unknown Album"
    year = 0
    track_num = 0
    duration = 0.0

    if MUTAGEN_AVAILABLE:
        try:
            audio = MutagenFile(str(p), easy=True)
        except Exception as e:  # noqa: BLE001
            log.debug("metadata.read.failed", path=str(p), error=str(e))
            audio = None

        if audio is not None:
            tags = getattr(audio, "tags", None) or {}

            def first(*keys: str) -> str:
                for key in keys:
                    value = tags.get(key)
                    if isinstance(value, list) and value:
                        return str(value[0])
                    if isinstance(value, str) and value:
                        return value
                    # WAV and AIFF keep their tags as ID3 frames inside a RIFF
                    # chunk, so the easy keys are simply absent even though the
                    # tags are there. Both spellings are checked rather than
                    # assuming which container answered.
                    frame = _ID3_FRAME_FOR_EASY.get(key)
                    value = tags.get(frame) if frame else None
                    if value is not None and str(value):
                        return str(value)
                return ""

            title = first("title") or title
            artist = first("artist", "albumartist", "performer") or artist
            album = first("album") or album
            duration = float(getattr(getattr(audio, "info", None), "length", 0.0) or 0.0)

            date = first("date", "year", "originaldate")
            if date[:4].isdigit():
                year = int(date[:4])

            number = first("tracknumber")
            if number.split("/")[0].isdigit():
                track_num = int(number.split("/")[0])

    fid = file_id(p)
    artist_name = artist.strip() or "Unknown Artist"
    album_title = album.strip() or "Unknown Album"
    return {
        "id": fid,
        "fileId": fid,
        "filePath": abs_path(p),
        "title": title.strip() or p.stem,
        "artist": {"id": artist_name, "name": artist_name},
        "album": {"id": album_title, "title": album_title},
        "duration": round(duration, 3),
        "year": year,
        "trackNumber": track_num,
        "isDownloaded": True,
        "extension": p.suffix.lower(),
    }


def extract_artwork_bytes(path: Path | str) -> Optional[bytes]:
    """Embedded cover art for a file, or None. Best-effort by design."""
    if not MUTAGEN_AVAILABLE:
        return None
    try:
        audio = MutagenFile(str(path))
    except Exception:  # noqa: BLE001
        return None
    if audio is None:
        return None

    try:
        tags = getattr(audio, "tags", None)
        if tags is None:
            return None

        # MP4/M4A
        covers = tags.get("covr") if hasattr(tags, "get") else None
        if covers:
            return bytes(covers[0])

        # ID3 (mp3, wav)
        for value in tags.values():
            if value.__class__.__name__ == "APIC":
                return bytes(value.data)

        # FLAC
        if isinstance(audio, FLAC) and audio.pictures:
            return bytes(audio.pictures[0].data)
    except Exception as e:  # noqa: BLE001
        log.debug("metadata.artwork.failed", path=str(path), error=str(e))
    return None


def artwork_from_disk(path: Path | str) -> Optional[tuple[bytes, str]]:
    """Cover art from a sibling image file → (bytes, mime), or None.

    Downloads write the thumbnail next to the audio, so this is the common case
    and it costs one read with no tag parsing.
    """
    p = Path(path)
    for ext in ARTWORK_EXTENSIONS:
        candidate = p.with_suffix(ext)
        if candidate.is_file():
            try:
                return candidate.read_bytes(), MIME_BY_IMAGE_EXT.get(ext, "image/jpeg")
            except OSError:
                continue
    return None


# ── Write ─────────────────────────────────────────────────────


def write_tags(
    path: Path | str,
    *,
    title: str,
    artist: str,
    album: str = "",
    year: int = 0,
    track_number: int = 0,
    artwork: Optional[tuple[bytes, str]] = None,
) -> bool:
    """Write tags (and cover art) in place. True when something was written.

    Returns False rather than raising: tagging is the last, least important step
    of a download, and a file that plays but is untagged beats a failed job.
    """
    if not MUTAGEN_AVAILABLE:
        return False

    p = Path(path)
    ext = p.suffix.lower()
    cover_bytes, cover_mime = artwork or (None, "image/jpeg")

    try:
        if ext in {".m4a", ".mp4", ".aac"}:
            return _write_mp4(p, title, artist, album, year, track_number, cover_bytes, cover_mime)
        if ext == ".flac":
            return _write_flac(p, title, artist, album, year, track_number, cover_bytes, cover_mime)
        if ext == ".wav":
            return _write_wave(p, title, artist, album, year, track_number, cover_bytes, cover_mime)
        if ext == ".mp3":
            return _write_id3(p, title, artist, album, year, track_number, cover_bytes, cover_mime)
    except Exception as e:  # noqa: BLE001
        log.warning("metadata.write.failed", path=str(p), error=str(e))
    return False


def _write_mp4(
    p: Path,
    title: str,
    artist: str,
    album: str,
    year: int,
    track_number: int,
    cover: Optional[bytes],
    cover_mime: str,
) -> bool:
    audio = MP4(str(p))
    audio["\xa9nam"] = [title]
    audio["\xa9ART"] = [artist]
    if album:
        audio["\xa9alb"] = [album]
    if year:
        audio["\xa9day"] = [str(year)]
    if track_number:
        audio["trkn"] = [(track_number, 0)]
    if cover:
        fmt = MP4Cover.FORMAT_PNG if cover_mime == "image/png" else MP4Cover.FORMAT_JPEG
        audio["covr"] = [MP4Cover(cover, imageformat=fmt)]
    audio.save()
    return True


def _write_flac(
    p: Path,
    title: str,
    artist: str,
    album: str,
    year: int,
    track_number: int,
    cover: Optional[bytes],
    cover_mime: str,
) -> bool:
    audio = FLAC(str(p))
    audio["title"] = [title]
    audio["artist"] = [artist]
    if album:
        audio["album"] = [album]
    if year:
        audio["date"] = [str(year)]
    if track_number:
        audio["tracknumber"] = [str(track_number)]
    if cover:
        picture = Picture()
        picture.type = 3
        picture.mime = cover_mime
        picture.data = cover
        audio.clear_pictures()
        audio.add_picture(picture)
    audio.save()
    return True


def _write_wave(
    p: Path,
    title: str,
    artist: str,
    album: str,
    year: int,
    track_number: int,
    cover: Optional[bytes],
    cover_mime: str,
) -> bool:
    """WAV keeps its tags in a RIFF ``id3 `` chunk, which is a different
    writer from a bare ID3 block — mutagen owns that layout, not us."""
    audio = WAVE(str(p))
    if audio.tags is None:
        audio.add_tags()
    tags = audio.tags
    tags.delall("TIT2")
    tags.delall("TPE1")
    tags.add(TIT2(encoding=3, text=[title]))
    tags.add(TPE1(encoding=3, text=[artist]))
    if album:
        tags.delall("TALB")
        tags.add(TALB(encoding=3, text=[album]))
    if year:
        tags.delall("TDRC")
        tags.add(TDRC(encoding=3, text=[str(year)]))
    if track_number:
        tags.delall("TRCK")
        tags.add(TRCK(encoding=3, text=[str(track_number)]))
    if cover:
        tags.delall("APIC")
        tags.add(APIC(encoding=3, mime=cover_mime, type=3, desc="Cover", data=cover))
    audio.save()
    return True


def _write_id3(
    p: Path,
    title: str,
    artist: str,
    album: str,
    year: int,
    track_number: int,
    cover: Optional[bytes],
    cover_mime: str,
) -> bool:
    try:
        tags = ID3(str(p))
    except Exception:  # noqa: BLE001 - no existing tag block is normal
        tags = ID3()

    tags.delall("TIT2")
    tags.delall("TPE1")
    tags.add(TIT2(encoding=3, text=[title]))
    tags.add(TPE1(encoding=3, text=[artist]))
    if album:
        tags.delall("TALB")
        tags.add(TALB(encoding=3, text=[album]))
    if year:
        tags.delall("TDRC")
        tags.add(TDRC(encoding=3, text=[str(year)]))
    if track_number:
        tags.delall("TRCK")
        tags.add(TRCK(encoding=3, text=[str(track_number)]))
    if cover:
        tags.delall("APIC")
        tags.add(APIC(encoding=3, mime=cover_mime, type=3, desc="Cover", data=cover))
    tags.save(str(p))
    return True
