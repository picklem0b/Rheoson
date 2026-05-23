from __future__ import annotations
import httpx
import structlog
from pathlib import Path
from fastapi.responses import Response
from mutagen import File as MutagenFile
from mutagen.id3 import ID3
from mutagen.mp4 import MP4
from mutagen.flac import FLAC

log = structlog.get_logger()

_FALLBACK = b""   # empty — frontend handles missing artwork gracefully


def extract_artwork(path: Path) -> Response | None:
    """Extract embedded cover art from a local audio file."""
    suffix = path.suffix.lower()
    data   = b""
    mime   = "image/jpeg"

    try:
        if suffix == ".mp3":
            tags = ID3(path)
            for key in tags:
                if key.startswith("APIC"):
                    apic = tags[key]
                    data = apic.data
                    mime = apic.mime
                    break

        elif suffix in (".m4a", ".mp4", ".aac"):
            f = MP4(path)
            covers = f.get("covr", [])
            if covers:
                cover = covers[0]
                data  = bytes(cover)
                mime  = (
                    "image/jpeg" if cover.imageformat == cover.FORMAT_JPEG
                    else "image/png"
                )

        elif suffix == ".flac":
            f    = FLAC(path)
            pics = f.pictures
            if pics:
                data = pics[0].data
                mime = pics[0].mime

        else:
            f = MutagenFile(path)
            if hasattr(f, "pictures") and f.pictures:
                data = f.pictures[0].data

    except Exception as e:
        log.warning("artwork.extract.failed", path=str(path), error=str(e))

    if not data:
        return None

    return Response(content=data, media_type=mime)


async def fetch_remote_artwork(url: str) -> bytes:
    """Download artwork from a remote URL (e.g. ytmusicapi thumbnail)."""
    if not url:
        return b""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                return resp.content
    except Exception as e:
        log.warning("artwork.fetch.failed", url=url, error=str(e))
    return b""