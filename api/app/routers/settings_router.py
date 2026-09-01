"""Settings routes — music directories and library management.

Spotify credentials are now managed via environment variables only
(Render dashboard or .env file). The POST /spotify endpoint has
been removed for security.
"""

from __future__ import annotations
import asyncio
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.config import settings

router = APIRouter()


# ── Spotify status (read-only) ────────────────────────────────

@router.get("/spotify/status")
async def spotify_status():
    """Check if Spotify credentials are configured via environment."""
    return {
        "connected": settings.has_spotify,
        "clientId":  settings.SPOTIFY_CLIENT_ID[:8] + "..." if settings.has_spotify else "",
    }


# ── Music directories ─────────────────────────────────────────

class DirectoriesSchema(BaseModel):
    dirs: list[str]


@router.get("/directories")
async def get_directories():
    """Return all configured music directories and whether each actually exists."""
    configured = [settings.MUSIC_DIR] + list(settings.EXTRA_MUSIC_DIRS)
    result = []
    for d in configured:
        p = Path(d)
        result.append({
            "path":   d,
            "exists": p.exists(),
            "active": p.exists(),
        })
    return {"directories": result}


@router.post("/directories")
async def save_directories(body: DirectoriesSchema):
    """Persist the frontend's directory list to settings."""
    if not body.dirs:
        raise HTTPException(status_code=400, detail="At least one directory is required")

    primary = body.dirs[0]
    extra = body.dirs[1:]

    settings.MUSIC_DIR = primary
    settings.EXTRA_MUSIC_DIRS = extra

    env_path = Path(__file__).parent.parent.parent / ".env"
    lines: list[str] = []
    if env_path.exists():
        lines = env_path.read_text().splitlines()

    def _set(key: str, value: str) -> None:
        for i, line in enumerate(lines):
            if line.startswith(f"{key}="):
                lines[i] = f"{key}={value}"
                return
        lines.append(f"{key}={value}")

    _set("MUSIC_DIR", primary)
    _set("EXTRA_MUSIC_DIRS", ",".join(extra))
    env_path.write_text("\n".join(lines) + "\n")

    return {"ok": True, "directories": body.dirs}


# ── Directory browse ──────────────────────────────────────────

@router.get("/directories/browse")
async def browse_directory(path: str):
    """List audio files in a given directory path."""
    p = Path(path).resolve()
    allowed_bases = [Path(d).resolve() for d in settings.all_music_dirs_configured]
    if not any(str(p).startswith(str(base)) for base in allowed_bases):
        raise HTTPException(status_code=403, detail="Access denied: path outside configured music directories")
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"Path not found: {path}")
    if not p.is_dir():
        raise HTTPException(status_code=400, detail=f"Not a directory: {path}")

    AUDIO_EXTS = {".mp3", ".flac", ".m4a", ".opus", ".ogg", ".wav"}
    files = []
    for child in sorted(p.iterdir()):
        if child.suffix.lower() in AUDIO_EXTS:
            files.append({
                "name":     child.name,
                "path":     str(child),
                "size":     child.stat().st_size,
                "ext":      child.suffix.lstrip("."),
            })

    return {"path": str(p), "files": files, "count": len(files)}


# ── Rescan ────────────────────────────────────────────────────

class RescanSchema(BaseModel):
    dirs: list[str] | None = None


@router.post("/rescan")
async def rescan_library(body: RescanSchema | None = None):
    """Re-index all active directories."""
    from app.routers.track_router import invalidate_track_index

    if body and body.dirs:
        original_extra = settings.EXTRA_MUSIC_DIRS
        settings.EXTRA_MUSIC_DIRS = body.dirs[1:]
        if body.dirs:
            settings.MUSIC_DIR = body.dirs[0]

    invalidate_track_index()

    if body and body.dirs:
        settings.EXTRA_MUSIC_DIRS = original_extra

    return {"ok": True, "message": "Track index cleared — will rebuild on next request"}
