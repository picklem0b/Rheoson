"""Settings routes — music directories and library management.

Spotify credentials are now managed via environment variables only
(Render dashboard or .env file). The POST /spotify endpoint has
been removed for security.
"""

from __future__ import annotations
import asyncio
import json
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core import toolchain
from app.core.config import settings
from app.core.deps import get_current_user

router = APIRouter()


class DoctorFixSchema(BaseModel):
    kind: str  # "corrupt" | "duplicate" | "empty-dir" | "empty-dirs"
    path: str | None = None


def _is_under(path: Path, base: Path) -> bool:
    """True if `path` is `base` itself or nested below it."""
    try:
        path.relative_to(base)
        return True
    except ValueError:
        return False


def _require_admin(user: dict) -> None:
    """Instance-level config (music dirs, rescan) is admin-only.

    ADMIN_SUBS (env) lists the Clerk user ids allowed to mutate instance
    config. When unset: allowed in development (lab box), denied in
    production with a clear message — an empty allowlist must not silently
    mean "everyone is admin".
    """
    admins = settings.ADMIN_SUBS
    if not admins:
        if settings.is_dev:
            return
        raise HTTPException(
            status_code=403,
            detail="Instance configuration requires an admin user. Set ADMIN_SUBS in the server environment.",
        )
    if user.get("sub") not in admins:
        raise HTTPException(status_code=403, detail="Not an instance admin")


# ── Spotify status (read-only) ────────────────────────────────

@router.get("/spotify/status")
async def spotify_status(_user: dict = Depends(get_current_user)):
    """Check if Spotify credentials are configured via environment."""
    return {
        "connected": settings.has_spotify,
        "clientId":  settings.SPOTIFY_CLIENT_ID[:8] + "..." if settings.has_spotify else "",
    }


# ── Music directories ─────────────────────────────────────────

class DirectoriesSchema(BaseModel):
    dirs: list[str]


@router.get("/directories")
async def get_directories(_user: dict = Depends(get_current_user)):
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


def _persist_dirs_to_env(env_path: Path, primary: str, extra: list[str]) -> None:
    """Rewrite MUSIC_DIR / EXTRA_MUSIC_DIRS inside the .env file.

    EXTRA_MUSIC_DIRS is written as a JSON array (pydantic-settings parses
    list[str] env values with json.loads) — a naive comma join produces a
    value that fails Settings() parsing and the API refuses to boot on the
    next restart.
    """
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
    _set("EXTRA_MUSIC_DIRS", json.dumps(extra))
    env_path.write_text("\n".join(lines) + "\n")


@router.post("/directories")
async def save_directories(body: DirectoriesSchema, user: dict = Depends(get_current_user)):
    _require_admin(user)
    """Persist the frontend's directory list to settings."""
    if not body.dirs:
        raise HTTPException(status_code=400, detail="At least one directory is required")

    primary = body.dirs[0]
    extra = body.dirs[1:]

    settings.MUSIC_DIR = primary
    settings.EXTRA_MUSIC_DIRS = extra

    env_path = Path(__file__).parent.parent.parent / ".env"
    try:
        _persist_dirs_to_env(env_path, primary, extra)
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Could not persist directories: {e}") from e

    return {"ok": True, "directories": body.dirs}


# ── Directory browse ──────────────────────────────────────────

@router.get("/directories/browse")
async def browse_directory(path: str, _user: dict = Depends(get_current_user)):
    """List audio files in a given directory path."""
    p = Path(path).resolve()
    allowed_bases = [Path(d).resolve() for d in settings.all_music_dirs_configured]
    # Resolve-symlink too so a symlink inside a base dir cannot escape it.
    try:
        p_real = p.resolve()
        bases_real = [b.resolve() for b in allowed_bases]
    except Exception:
        p_real, bases_real = p, allowed_bases
    # commonpath (not startswith) so a sibling like /music_evil does not
    # count as being "under" /music.
    if not any(
        _is_under(p_real, base) for base in bases_real
    ):
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
async def rescan_library(body: RescanSchema | None = None, user: dict = Depends(get_current_user)):
    _require_admin(user)
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


# ── Tool maintenance ──────────────────────────────────────────

@router.post("/tools/update")
async def update_tools(user: dict = Depends(get_current_user)):
    """Update yt-dlp in place.

    The most common cause of "this track refuses to play" is a yt-dlp that
    has fallen behind YouTube's player changes, and the upstream fix is its
    own `-U` self-update. That already runs on a daily cron, but a user
    staring at a broken track should not have to wait for 03:00 UTC — the
    diagnostics screen offers it as a one-tap repair instead.
    """
    _require_admin(user)
    ok, output = await asyncio.to_thread(toolchain.upgrade_ytdlp)
    await _refresh_health_probe()
    return {"ok": ok, "output": output}


@router.post("/tools/install-ffmpeg")
async def install_ffmpeg(user: dict = Depends(get_current_user)):
    """Provide the audio post-processor downloads and fallback playback need.

    Audio extraction, format conversion and thumbnail embedding all run
    through ffmpeg, and the transcoding fallback cannot exist without it. On
    the Android build the Termux package manager installs it without any
    privilege escalation, which is the one case the server can repair itself;
    elsewhere the response carries the command for the operator to run.
    """
    _require_admin(user)
    ok, output = await asyncio.to_thread(toolchain.install_ffmpeg)
    await _refresh_health_probe()
    return {"ok": ok, "output": output}


@router.get("/tools")
async def tool_status(user: dict = Depends(get_current_user)):
    """What this host can actually do, for the diagnostics screen."""
    _require_admin(user)
    return toolchain.capabilities()


async def _refresh_health_probe() -> None:
    """Re-probe after a tool change so the Doctor reflects it immediately.

    The health snapshot is refreshed once a minute; without this the screen
    that just repaired ffmpeg would keep reporting it missing until the next
    background pass.
    """
    try:
        from app.core import health
        await health.refresh_probe()
    except Exception:  # noqa: BLE001 — a stale probe must not fail the repair
        pass


# ── Backup & restore ──────────────────────────────────────────

@router.get("/backup")
async def export_backup(user: dict = Depends(get_current_user)):
    """Everything the signed-in user owns, as one JSON document.

    Likes, hidden tracks, play history, playlists and artist follows. The
    music files are not included — they are already on disk and can be
    re-scanned; what cannot be recreated is the state that took months to
    accumulate.
    """
    from app.services.backup_service import export_state

    return await export_state(user["sub"])


class RestoreSchema(BaseModel):
    format: str | None = None
    version: int | None = None
    liked: list[str] | None = None
    disliked: list[str] | None = None
    history: list[dict] | None = None
    playlists: dict[str, dict] | None = None
    follows: list[dict] | None = None
    # True unions with existing state (safe default); False replaces it, which
    # is what restoring onto a fresh install wants.
    merge: bool = True


@router.post("/restore")
async def restore_backup(body: RestoreSchema, user: dict = Depends(get_current_user)):
    """Apply a backup bundle produced by GET /settings/backup."""
    from app.services.backup_service import restore_state

    try:
        return await restore_state(user["sub"], body.model_dump(), merge=body.merge)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Library doctor ────────────────────────────────────────────
# Scans are pure filesystem walks; repairs delete only what a scan
# reported and re-validate each path before removing it.


async def _run_doctor(fn, *args):
    """Run blocking doctor work off the event loop, mapping ValueError to 400."""
    try:
        return await asyncio.to_thread(fn, *args)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/doctor/scan")
async def doctor_scan(user: dict = Depends(get_current_user)):
    """Scan the library for corrupt files, duplicates and empty folders.

    Admin-only: the scan is an instance-wide filesystem walk, and the repairs
    it feeds delete files, so it sits behind the same gate as the directory
    and rescan routes rather than being open to every signed-in account.
    """
    _require_admin(user)
    from app.services import library_doctor

    return await asyncio.to_thread(library_doctor.scan_library)


@router.post("/doctor/fix")
async def doctor_fix(body: DoctorFixSchema, user: dict = Depends(get_current_user)):
    """Repair one reported item, or sweep all of one kind when no path given."""
    _require_admin(user)
    from app.services import library_doctor

    kind = body.kind
    if kind == "corrupt":
        if body.path:
            return await _run_doctor(library_doctor.delete_corrupt_file, body.path)
        return await _run_doctor(library_doctor.delete_all_corrupt)
    if kind == "duplicate":
        if body.path:
            return await _run_doctor(library_doctor.delete_duplicate_file, body.path)
        return await _run_doctor(library_doctor.delete_all_duplicates)
    if kind == "empty-dir":
        if not body.path:
            raise HTTPException(status_code=400, detail="empty-dir fix requires a path")
        return await _run_doctor(library_doctor.delete_empty_dir, body.path)
    if kind == "empty-dirs":
        return await _run_doctor(library_doctor.prune_empty_dirs)
    raise HTTPException(status_code=400, detail=f"unknown fix kind: {kind}")
