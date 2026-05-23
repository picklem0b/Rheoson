from __future__ import annotations
import hashlib
import structlog
from pathlib import Path
from mutagen import File as MutagenFile
from mutagen.id3 import ID3, TIT2, TPE1, TALB, TRCK, APIC, TDRC, USLT
from mutagen.mp4 import MP4, MP4Cover
from mutagen.flac import FLAC, Picture
from mutagen.oggvorbis import OggVorbis

log = structlog.get_logger()


def _file_id(path: Path) -> str:
    """Deterministic ID from file path."""
    return hashlib.md5(str(path).encode()).hexdigest()[:16]


def read_track_metadata(path: Path) -> dict:
    """Read ID3/vorbis tags from a local file → TrackSchema-compatible dict."""
    suffix = path.suffix.lower()
    title  = path.stem
    artist = "Unknown Artist"
    album  = "Unknown Album"
    year   = 0
    track_num = 0
    artwork = ""

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

        # Duration
        duration = f.info.length if f and f.info else 0.0

    except Exception as e:
        log.warning("metadata.read.failed", path=str(path), error=str(e))
        duration = 0.0

    file_id = _file_id(path)

    return {
        "id":           file_id,
        "title":        title,
        "duration":     duration,
        "artworkUrl":   f"/api/stream/{file_id}/artwork",
        "youtubeId":    None,
        "spotifyId":    None,
        "isDownloaded": True,
        "isLiked":      False,
        "filePath":     str(path),
        "streamUrl":    f"/api/stream/{file_id}/audio",
        "artist": {
            "id":       hashlib.md5(artist.encode()).hexdigest()[:8],
            "name":     artist,
            "imageUrl": None,
            "genres":   [],
        },
        "album": {
            "id":          hashlib.md5(album.encode()).hexdigest()[:8],
            "title":       album,
            "artworkUrl":  f"/api/stream/{file_id}/artwork",
            "releaseYear": year,
            "trackCount":  0,
            "artist": {
                "id":       hashlib.md5(artist.encode()).hexdigest()[:8],
                "name":     artist,
                "imageUrl": None,
                "genres":   [],
            },
        },
    }


def write_tags(
    path: Path,
    title:   str,
    artist:  str,
    album:   str,
    year:    int     = 0,
    artwork: bytes   = b"",
    lyrics:  str     = "",
    track:   int     = 0,
) -> None:
    """Write metadata tags to a downloaded file."""
    suffix = path.suffix.lower()

    try:
        if suffix == ".mp3":
            _write_mp3(path, title, artist, album, year, artwork, lyrics, track)
        elif suffix == ".flac":
            _write_flac(path, title, artist, album, year, artwork, lyrics)
        elif suffix in (".m4a", ".mp4", ".aac"):
            _write_m4a(path, title, artist, album, year, artwork, lyrics)
        elif suffix in (".ogg", ".opus"):
            _write_ogg(path, title, artist, album, year, lyrics)
        log.info("metadata.write.ok", path=str(path))
    except Exception as e:
        log.error("metadata.write.failed", path=str(path), error=str(e))


def _write_mp3(path, title, artist, album, year, artwork, lyrics, track):
    try:
        tags = ID3(path)
    except Exception:
        tags = ID3()
    tags["TIT2"] = TIT2(encoding=3, text=title)
    tags["TPE1"] = TPE1(encoding=3, text=artist)
    tags["TALB"] = TALB(encoding=3, text=album)
    if year:
        tags["TDRC"] = TDRC(encoding=3, text=str(year))
    if track:
        tags["TRCK"] = TRCK(encoding=3, text=str(track))
    if artwork:
        tags["APIC"] = APIC(
            encoding=3,
            mime="image/jpeg",
            type=3,
            desc="Cover",
            data=artwork,
        )
    if lyrics:
        tags["USLT"] = USLT(encoding=3, lang="eng", desc="", text=lyrics)
    tags.save(path, v2_version=3)


def _write_flac(path, title, artist, album, year, artwork, lyrics):
    f = FLAC(path)
    f["title"]  = title
    f["artist"] = artist
    f["album"]  = album
    if year:
        f["date"] = str(year)
    if lyrics:
        f["lyrics"] = lyrics
    if artwork:
        pic           = Picture()
        pic.type      = 3
        pic.mime      = "image/jpeg"
        pic.data      = artwork
        f.clear_pictures()
        f.add_picture(pic)
    f.save()


def _write_m4a(path, title, artist, album, year, artwork, lyrics):
    f = MP4(path)
    f["\xa9nam"] = title
    f["\xa9ART"] = artist
    f["\xa9alb"] = album
    if year:
        f["\xa9day"] = str(year)
    if lyrics:
        f["\xa9lyr"] = lyrics
    if artwork:
        f["covr"] = [MP4Cover(artwork, imageformat=MP4Cover.FORMAT_JPEG)]
    f.save()


def _write_ogg(path, title, artist, album, year, lyrics):
    f = OggVorbis(path)
    f["title"]  = title
    f["artist"] = artist
    f["album"]  = album
    if year:
        f["date"] = str(year)
    if lyrics:
        f["lyrics"] = lyrics
    f.save()