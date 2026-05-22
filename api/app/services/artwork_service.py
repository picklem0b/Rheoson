from pathlib import Path
from mutagen.id3 import ID3, APIC
from fastapi.responses import Response


def extract_artwork(path: Path) -> Response | None:
    try:
        tags = ID3(path)
        for tag in tags.values():
            if isinstance(tag, APIC):
                return Response(content=tag.data, media_type=tag.mime)
    except Exception:
        pass
    return None
