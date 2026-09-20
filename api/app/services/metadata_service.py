from __future__ import annotations
import base64
import hashlib
import os
import structlog
from pathlib import Path
from mutagen import File as MutagenFile
from mutagen.id3 import ID3, APIC, TALB, TDRC, TIT2, TPE1, TRCK, USLT
from mutagen.mp4 import MP4, MP4Cover
from mutagen.flac import FLAC, Picture
from mutagen.oggopus import OggOpus
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

    # Stable-identity bridge: if this file was downloaded from YouTube, its
    # videoId is recorded in the sidecar map — attach it so the frontend can
    # dedupe against search results and likes/history resolve locally.
    try:
        from app.services import track_identity
        _mapped = track_identity.lookup_by_file(file_id)
        youtube_id = _mapped["video_id"] if _mapped else None
    except Exception:
        youtube_id = None

    artist_id = hashlib.md5(artist.encode()).hexdigest()[:8]
    album_id  = hashlib.md5(album.encode()).hexdigest()[:8]

    return {
        "id":           file_id,
        "title":        title,
        "duration":     duration,
        "artworkUrl":   artwork_url,
        "youtubeId":    youtube_id,
        "spotifyId":    None,
        "isDownloaded": True,
        "isLiked":      False,
        "trackNumber":  track_num,
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
            tags = getattr(f, "tags", None)
            if tags:
                # Vorbis comments carry artwork as a base64-encoded FLAC
                # picture structure in `metadata_block_picture`. Looking for
                # an object with `.data` — the previous approach — matched
                # nothing, because the value is a plain base64 string.
                raw = tags.get("metadata_block_picture")
                if raw:
                    encoded = raw[0] if isinstance(raw, (list, tuple)) else raw
                    picture = Picture(base64.b64decode(encoded))
                    if picture.data:
                        return bytes(picture.data)
    except Exception as e:
        log.debug("metadata.artwork.failed", path=str(path), error=str(e))
    return None


# ── Writing tags ──────────────────────────────────────────────

# Picture types per the ID3/Vorbis convention: 3 is "front cover".
_PICTURE_TYPE_FRONT_COVER = 3


def _image_mime(data: bytes) -> str:
    """Sniff the artwork's MIME type from its signature.

    The remote fetcher returns raw bytes with no content type attached, and all
    three tag formats need the MIME declared. Guessing from the URL is not
    reliable — ytmusicapi thumbnails are served extensionless through
    arbitrary CDN paths — so the bytes are inspected directly.
    """
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    # Most tag readers fall back to JPEG when the type is unknown, which is the
    # safest default for a mislabelled buffer.
    return "image/jpeg"


def write_tags(
    path: Path,
    *,
    title: str | None = None,
    artist: str | None = None,
    album: str = "",
    artwork: bytes | None = None,
    lyrics: str = "",
    track_number: int = 0,
    date: str = "",
) -> None:
    """Write title/artist/album/artwork/lyrics into a downloaded audio file.

    Handles the containers this app downloads: ``mp3`` (ID3), ``m4a``/``mp4``/
    ``aac`` (iTunes atoms), ``flac`` and ``ogg``/``opus`` (Vorbis comments).
    Only the fields actually supplied are written — ``title=None`` or
    ``artist=None`` leaves that field untouched, which is how the download
    pipeline expresses "the user asked for no metadata embedding". Empty
    artwork or lyrics are skipped rather than stored as zero-length frames — a
    placeholder cover is worse than none, because readers show a broken image
    instead of falling back to the album-less default.

    Raises for an unsupported container or a genuine write failure; the caller
    treats tagging as best-effort and records the reason.
    """
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"cannot tag missing file: {path}")

    suffix = path.suffix.lower()
    artwork = artwork or b""
    cover_data = artwork if artwork else None

    if suffix == ".mp3":
        try:
            tags = ID3(path)
        except Exception:
            # A file with no existing ID3 tag raises rather than returning
            # empty — start a fresh tag block in that case.
            tags = ID3()
        if title is not None:
            tags.delall("TIT2")
        if artist is not None:
            tags.delall("TPE1")
        tags.delall("TALB")
        tags.delall("TRCK")
        tags.delall("TDRC")
        tags.delall("APIC")
        tags.delall("USLT")
        if title is not None:
            tags.add(TIT2(encoding=3, text=title))
        if artist is not None:
            tags.add(TPE1(encoding=3, text=artist))
        if album:
            tags.add(TALB(encoding=3, text=album))
        if track_number:
            tags.add(TRCK(encoding=3, text=str(track_number)))
        if date:
            tags.add(TDRC(encoding=3, text=date))
        if cover_data:
            tags.add(
                APIC(
                    encoding=3,
                    mime=_image_mime(cover_data),
                    type=_PICTURE_TYPE_FRONT_COVER,
                    desc="Cover",
                    data=cover_data,
                )
            )
        if lyrics:
            tags.add(USLT(encoding=3, lang="eng", desc="", text=lyrics))
        tags.save(path)

    elif suffix in (".m4a", ".mp4", ".aac", ".m4b"):
        audio = MP4(path)
        if audio.tags is None:
            audio.add_tags()
        if not audio.tags:
            raise RuntimeError("could not create an MP4 tag block")
        if title is not None:
            audio.tags["\xa9nam"] = [title]
        if artist is not None:
            audio.tags["\xa9ART"] = [artist]
        if album:
            audio.tags["\xa9alb"] = [album]
        if date:
            audio.tags["\xa9day"] = [date]
        if track_number:
            audio.tags["trkn"] = [(track_number, 0)]
        if cover_data:
            fmt = (
                MP4Cover.FORMAT_PNG
                if _image_mime(cover_data) == "image/png"
                else MP4Cover.FORMAT_JPEG
            )
            audio.tags["covr"] = [MP4Cover(cover_data, imageformat=fmt)]
        if lyrics:
            audio.tags["\xa9lyr"] = [lyrics]
        audio.save()

    elif suffix == ".flac":
        audio = FLAC(path)
        if title is not None:
            audio["title"] = [title]
        if artist is not None:
            audio["artist"] = [artist]
        if album:
            audio["album"] = [album]
        if date:
            audio["date"] = [date]
        if track_number:
            audio["tracknumber"] = [str(track_number)]
        if lyrics:
            audio["lyrics"] = [lyrics]
        if cover_data:
            picture = Picture()
            picture.type = _PICTURE_TYPE_FRONT_COVER
            picture.mime = _image_mime(cover_data)
            picture.desc = "Cover"
            picture.data = cover_data
            audio.clear_pictures()
            audio.add_picture(picture)
        audio.save()

    elif suffix in (".ogg", ".opus"):
        audio = OggOpus(path) if suffix == ".opus" else OggVorbis(path)
        if title is not None:
            audio["title"] = [title]
        if artist is not None:
            audio["artist"] = [artist]
        if album:
            audio["album"] = [album]
        if date:
            audio["date"] = [date]
        if track_number:
            audio["tracknumber"] = [str(track_number)]
        if lyrics:
            audio["lyrics"] = [lyrics]
        if cover_data:
            # Vorbis has no picture block; the convention is a base64-encoded
            # FLAC picture structure in a `metadata_block_picture` comment.
            picture = Picture()
            picture.type = _PICTURE_TYPE_FRONT_COVER
            picture.mime = _image_mime(cover_data)
            picture.desc = "Cover"
            picture.data = cover_data
            audio["metadata_block_picture"] = [
                base64.b64encode(picture.write()).decode("ascii")
            ]
        audio.save()

    else:
        raise ValueError(f"unsupported container for tagging: {suffix or 'no extension'}")

    log.debug(
        "metadata.write.ok",
        path=str(path),
        container=suffix,
        has_artwork=bool(cover_data),
        has_lyrics=bool(lyrics),
    )