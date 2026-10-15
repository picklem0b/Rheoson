"""Library browsing and shared file lookup.

Reads the same directories the server scans (``MUSIC_DIR`` plus the playlist
folders under ``DOWNLOADS_DIR``) through the server's own metadata reader, so
a file listed here carries exactly the id, tags and path the library index
would report.
"""

from __future__ import annotations

from pathlib import Path

from app.core.config import settings
from app.services.metadata_service import read_track_metadata

from cli import ui

AUDIO_EXTS = {".mp3", ".flac", ".m4a", ".mp4", ".webm", ".ogg", ".opus", ".wav"}


def library_roots() -> list[Path]:
    """Directories that hold audio: the library and the playlist downloads."""
    roots = [
        Path(settings.MUSIC_DIR).expanduser(),
        Path(settings.DOWNLOADS_DIR).expanduser(),
    ]
    seen: list[Path] = []
    for root in roots:
        if root.exists() and root not in seen:
            seen.append(root)
    return seen


def find_files(query: str, *, limit: int = 20) -> list[Path]:
    """Case-insensitive substring search over track file names.

    An absolute/relative path that exists is returned directly, so
    ``rheoson rename ./song.mp3 ...`` works without a scan.
    """
    direct = Path(query).expanduser()
    if direct.is_file():
        return [direct]

    needle = query.lower().strip()
    matches: list[Path] = []
    for root in library_roots():
        for path in root.rglob("*"):
            if path.suffix.lower() not in AUDIO_EXTS:
                continue
            if needle and needle not in path.stem.lower():
                continue
            matches.append(path)
            if len(matches) >= limit:
                return matches
    return matches


def iter_tracks(include_downloads: bool = True) -> list[dict]:
    """Every readable track across the configured roots."""
    roots = [Path(settings.MUSIC_DIR).expanduser()]
    if include_downloads:
        roots.append(Path(settings.DOWNLOADS_DIR).expanduser())
    out: list[dict] = []
    for root in roots:
        if not root.exists():
            continue
        for path in sorted(root.rglob("*")):
            if path.suffix.lower() not in AUDIO_EXTS:
                continue
            try:
                out.append(read_track_metadata(path))
            except Exception:
                continue
    return out


def list_playlists() -> list[tuple[str, int, Path]]:
    """Playlist folders under ``DOWNLOADS_DIR`` → (name, track count, path)."""
    root = Path(settings.DOWNLOADS_DIR).expanduser()
    found: list[tuple[str, int, Path]] = []
    if not root.exists():
        return found
    for folder in sorted(p for p in root.iterdir() if p.is_dir() and not p.name.startswith(".")):
        count = sum(1 for f in folder.rglob("*") if f.suffix.lower() in AUDIO_EXTS)
        if count:
            found.append((folder.name, count, folder))
    return found


def cmd_library(args) -> int:
    """``rheoson library [--playlists] [--downloads-only]``"""
    ui.blank()

    if getattr(args, "playlists", False):
        playlists = list_playlists()
        ui.info("Playlist folders")
        ui.sep()
        if not playlists:
            ui.dim("No playlist folders yet. Try: rheoson playlist <url>")
            ui.blank()
            return 0
        ui.table(
            [[name, str(count), str(path)] for name, count, path in playlists],
            ["NAME", "TRACKS", "PATH"],
        )
        ui.blank()
        return 0

    tracks = iter_tracks(include_downloads=not getattr(args, "music_only", False))
    ui.info("Local library")
    ui.sep()
    if not tracks:
        ui.dim("Library is empty. Download some tracks first.")
        ui.blank()
        return 0
    ui.dim(f"{len(tracks)} tracks across {len(library_roots())} folder(s)")
    for i, t in enumerate(tracks):
        ui.track(t, i)
    ui.blank()
    return 0
