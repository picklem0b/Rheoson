"""Library doctor — library-health scanning and cleanup.

Three capabilities, all filesystem-only (no database needed):

  1. corrupt files  — files that look like audio but cannot be parsed by
     mutagen (truncated downloads, HTML saved as .mp3, zero bytes)
  2. duplicates     — same title+artist downloaded more than once
                     (different formats count; the oldest file wins)
  3. empty folders  — leftover directories after files were removed

The scan never mutates anything. Repair actions are explicit endpoints
and delete only what the scan reported by exact path, with a path
traversal guard and a re-validation that each path is still corrupt or
a duplicate before it is removed.

Scan results are cached in-process keyed by the directory set, so the
Doctor screen can re-open without rescanning a large library every time.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import structlog

from app.core.config import settings

log = structlog.get_logger()

AUDIO_EXTS = {"mp3", "flac", "m4a", "mp4", "webm", "ogg", "opus", "wav"}

# Files below this size are treated as corrupt regardless of parseability —
# a real audio file is never a few hundred bytes.
MIN_VALID_BYTES = 8 * 1024

# ── Cache ─────────────────────────────────────────────────────

_scan_cache: dict[str, Any] | None = None
_scan_cache_dirs: str | None = None


def invalidate_doctor_cache() -> None:
    """Drop the cached scan. Called after any repair action and by tests."""
    global _scan_cache, _scan_cache_dirs
    _scan_cache = None
    _scan_cache_dirs = None


def _dirs_key() -> str:
    return "|".join(settings.all_music_dirs)


def _cached() -> dict[str, Any] | None:
    if _scan_cache is not None and _scan_cache_dirs == _dirs_key():
        return _scan_cache
    return None


# ── Scanning ──────────────────────────────────────────────────

def scan_library() -> dict[str, Any]:
    """Walk every configured music dir and classify every audio file.

    Returns a summary dict the Doctor UI renders directly.
    """
    global _scan_cache, _scan_cache_dirs

    cached = _cached()
    if cached is not None:
        return cached

    corrupt: list[dict[str, Any]] = []
    duplicates: list[dict[str, Any]] = []
    empty_dirs: list[str] = []
    scanned = 0
    total_bytes = 0

    seen: dict[tuple[str, str], dict[str, Any]] = {}
    dirs = [Path(d) for d in settings.all_music_dirs]

    for base in dirs:
        for path in sorted(base.rglob("*")):
            if path.is_dir():
                continue

            if path.suffix.lstrip(".").lower() not in AUDIO_EXTS:
                continue

            scanned += 1

            try:
                size = path.stat().st_size
            except OSError:
                size = 0
            total_bytes += size

            # ── Corrupt / unreadable ──────────────────────
            if size < MIN_VALID_BYTES:
                corrupt.append(
                    _entry(path, size, "tiny", "File is too small to be real audio")
                )
                continue

            if _is_corrupt(path):
                corrupt.append(
                    _entry(path, size, "unreadable", "File could not be read as audio")
                )
                continue

            # ── Duplicates (only healthy files are compared) ─
            # Best-effort tag read — a corrupt file already got reported
            # above, and its tags do not matter for dedup.
            title, artist = _read_title_artist(path)
            key = (title.strip().lower(), artist.strip().lower())
            if not title.strip():
                continue

            prev = seen.get(key)
            if prev is None:
                seen[key] = _entry(path, size, None, "")
            else:
                # The oldest file is the keeper; the newer one is the extra.
                if prev["mtime"] <= _mtime(path):
                    keep, drop = prev, _entry(path, size, None, "Duplicate")
                else:
                    keep, drop = _entry_from_prev(prev), _entry(path, size, None, "Duplicate")
                    seen[key] = keep
                drop["keep"] = keep["name"]
                drop["keepPath"] = keep["path"]
                duplicates.append(drop)

        # ── Empty dirs (prune-style cleanup) ──────────────────
        for d in sorted(base.rglob("*")):
            if d.is_dir() and not any(d.iterdir()):
                empty_dirs.append(str(d))

    result = {
        "scanned": scanned,
        "totalBytes": total_bytes,
        "corrupt": corrupt,
        "duplicates": duplicates,
        "emptyDirs": empty_dirs,
        "dirs": [str(d) for d in dirs],
        "scannedAt": _now_iso(),
    }

    _scan_cache = result
    _scan_cache_dirs = _dirs_key()
    return result


def _entry(path: Path, size: int, kind: str | None, note: str) -> dict[str, Any]:
    return {
        "path": str(path),
        "name": path.name,
        "size": size,
        "mtime": _mtime(path),
        "ext": path.suffix.lstrip(".").lower(),
        "kind": kind,
        "note": note,
    }


def _entry_from_prev(prev: dict[str, Any]) -> dict[str, Any]:
    """Re-use a stored seen-entry as the dropped-side entry."""
    out = dict(prev)
    out["note"] = "Duplicate"
    return out


def _mtime(path: Path) -> int:
    try:
        return int(path.stat().st_mtime)
    except OSError:
        return 0


def _now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


def _read_title_artist(path: Path) -> tuple[str, str]:
    """Best-effort tag read for dedup grouping. Never raises."""
    try:
        from mutagen import File as MutagenFile

        f = MutagenFile(path, easy=True)
        if not f:
            return path.stem, "Unknown Artist"
        title = str(f.get("title", [path.stem])[0])
        artist = str(f.get("artist", ["Unknown Artist"])[0])
        return title, artist
    except Exception:
        return path.stem, "Unknown Artist"


def _is_corrupt(path: Path) -> bool:
    """True when mutagen cannot parse the file at all.

    mutagen raises on truncated frames / wrong formats and returns a
    falsy value for unrecognised containers. Header-only sniffing is
    deliberately not used — it misses the subtle truncations that make
    playback fail mid-song, which is the actual complaint this fixes.
    """
    try:
        from mutagen import File as MutagenFile

        f = MutagenFile(path, easy=True)
        if f is None or getattr(f.info, "length", 0) <= 0:
            return True
        return False
    except Exception:
        return True


# ── Repair actions ────────────────────────────────────────────

def _validate_managed_path(raw: str) -> Path:
    """Resolve a reported path and ensure it lives in a configured music dir."""
    p = Path(raw).resolve()
    for d in settings.all_music_dirs:
        base = Path(d).resolve()
        if base == p or base in p.parents:
            return p
    raise ValueError("path is outside the configured music directories")


def delete_corrupt_file(raw_path: str) -> dict[str, Any]:
    """Delete one corrupt file. Re-verifies corruption before removing."""
    p = _validate_managed_path(raw_path)
    if not p.exists():
        invalidate_doctor_cache()
        return {"deleted": False, "reason": "already gone"}
    if p.suffix.lstrip(".").lower() not in AUDIO_EXTS:
        raise ValueError("not an audio file")
    if p.stat().st_size >= MIN_VALID_BYTES and not _is_corrupt(p):
        raise ValueError("file is no longer corrupt — refusing to delete")
    p.unlink()
    invalidate_doctor_cache()
    log.info("doctor.deleted_corrupt", path=str(p))
    return {"deleted": True, "path": str(p)}


def delete_duplicate_file(raw_path: str) -> dict[str, Any]:
    """Delete one duplicate file. Re-verifies a healthy twin still exists."""
    p = _validate_managed_path(raw_path)
    if not p.exists():
        invalidate_doctor_cache()
        return {"deleted": False, "reason": "already gone"}
    if p.suffix.lstrip(".").lower() not in AUDIO_EXTS:
        raise ValueError("not an audio file")
    if _is_corrupt(p):
        raise ValueError("file is corrupt, not a duplicate — use the corrupt action")

    # A healthy twin with the same tags must still exist, otherwise this
    # file is the only copy and deleting it would lose the track.
    title, artist = _read_title_artist(p)
    key = (title.strip().lower(), artist.strip().lower())
    for d in settings.all_music_dirs:
        for other in Path(d).rglob("*"):
            if other == p or not other.is_file():
                continue
            if other.suffix.lstrip(".").lower() not in AUDIO_EXTS:
                continue
            if _is_corrupt(other):
                continue
            t2, a2 = _read_title_artist(other)
            if (t2.strip().lower(), a2.strip().lower()) == key:
                p.unlink()
                invalidate_doctor_cache()
                log.info("doctor.deleted_duplicate", path=str(p))
                return {"deleted": True, "path": str(p)}

    raise ValueError("no healthy duplicate found — refusing to delete the last copy")


def delete_empty_dir(raw_path: str) -> dict[str, Any]:
    """Remove one empty directory (rmdir fails if it gained files meanwhile)."""
    p = _validate_managed_path(raw_path)
    if not p.exists():
        invalidate_doctor_cache()
        return {"deleted": False, "reason": "already gone"}
    p.rmdir()  # only succeeds when empty — built-in safety
    invalidate_doctor_cache()
    return {"deleted": True, "path": str(p)}


def delete_all_corrupt() -> dict[str, Any]:
    """Batch-delete every corrupt file found by the latest scan."""
    scan = scan_library()
    deleted = 0
    failed = 0
    for entry in scan["corrupt"]:
        try:
            res = delete_corrupt_file(entry["path"])
            if res.get("deleted"):
                deleted += 1
        except Exception:
            failed += 1
    return {"deleted": deleted, "failed": failed}


def delete_all_duplicates() -> dict[str, Any]:
    """Batch-delete every duplicate found by the latest scan."""
    scan = scan_library()
    deleted = 0
    failed = 0
    for entry in scan["duplicates"]:
        try:
            res = delete_duplicate_file(entry["path"])
            if res.get("deleted"):
                deleted += 1
        except Exception:
            failed += 1
    return {"deleted": deleted, "failed": failed}


def prune_empty_dirs() -> dict[str, Any]:
    """Remove every empty directory found by the latest scan."""
    scan = scan_library()
    deleted = 0
    for d in scan["emptyDirs"]:
        try:
            delete_empty_dir(d)
            deleted += 1
        except Exception:
            pass
    return {"deleted": deleted}


# Per-user (device-local) scan support ─────────────────────────────────────────────

_USER_CACHE: dict[str, Any] | None = None
_USER_CACHE_KEY: str | None = None


def invalidate_user_cache() -> None:
    global _USER_CACHE, _USER_CACHE_KEY
    _USER_CACHE = None
    _USER_CACHE_KEY = None


def _user_dir_key(user_sub: str, basedir: str) -> str:
    return f"{user_sub}:{basedir}"


def _user_cached(user_sub: str, basedir: str) -> dict[str, Any] | None:
    if _USER_CACHE is not None and _USER_CACHE_KEY == _user_dir_key(user_sub, basedir):
        return _USER_CACHE
    return None


def _user_cache_set(user_sub: str, basedir: str, value: dict[str, Any]) -> None:
    global _USER_CACHE, _USER_CACHE_KEY
    _USER_CACHE = value
    _USER_CACHE_KEY = _user_dir_key(user_sub, basedir)


def scan_user_library(user_sub: str, basedir: str | None = None) -> dict[str, Any]:
    """Walk a user's local music directory and classify every audio file.

    Unlike scan_library() which is instance-wide and admin-only, this scans
    the per-user music dir (default: MUSIC_DIR) and is safe for any signed-in
    user to call. Results are cached per (user, basedir) pair.
    """
    if basedir is None:
        basedir = settings.MUSIC_DIR

    basedir_path = Path(basedir)
    if not basedir_path.is_dir():
        return {
            "scanned": 0,
            "totalBytes": 0,
            "corrupt": [],
            "duplicates": [],
            "emptyDirs": [],
            "dirs": [basedir],
            "scannedAt": _now_iso(),
        }

    cached = _user_cached(user_sub, basedir)
    if cached is not None:
        return cached

    corrupt: list[dict[str, Any]] = []
    duplicates: list[dict[str, Any]] = []
    empty_dirs: list[str] = []
    scanned = 0
    total_bytes = 0

    seen: dict[tuple[str, str], dict[str, Any]] = {}
    base = basedir_path

    MAX_SCAN_DEPTH = 8
    MAX_FILES = 5000

    try:
        all_paths: list[Path] = []
        for root, dirs, files in os.walk(base):
            # os.walk hands back strings; the depth is counted on the path
            # relative to the music dir, not on separators inside it.
            if len(Path(root).relative_to(base).parts) >= MAX_SCAN_DEPTH:
                dirs.clear()
                continue
            for f in files:
                all_paths.append(Path(root) / f)
                if len(all_paths) >= MAX_FILES:
                    break
        all_paths.sort()
    except OSError:
        return {
            "scanned": 0,
            "totalBytes": 0,
            "corrupt": [],
            "duplicates": [],
            "emptyDirs": [],
            "dirs": [basedir],
            "scannedAt": _now_iso(),
        }

    for path in all_paths:
        if not path.is_file():
            continue
        if path.suffix.lstrip(".").lower() not in AUDIO_EXTS:
            continue

        scanned += 1
        try:
            size = path.stat().st_size
        except OSError:
            size = 0
        total_bytes += size

        if size < MIN_VALID_BYTES:
            corrupt.append(
                _user_entry(path, size, "tiny", "File is too small to be real audio")
            )
            continue
        if _is_corrupt(path):
            corrupt.append(
                _user_entry(path, size, "unreadable", "File could not be read as audio")
            )
            continue

        title, artist = _read_title_artist(path)
        key = (title.strip().lower(), artist.strip().lower())
        if not title.strip():
            continue

        prev = seen.get(key)
        if prev is None:
            seen[key] = _user_entry(path, size, None, "")
        else:
            if prev["mtime"] <= _user_mtime(path):
                keep, drop = prev, _user_entry(path, size, None, "Duplicate")
            else:
                keep, drop = _user_entry_from_prev(prev), _user_entry(path, size, None, "Duplicate")
            seen[key] = keep
            drop["keep"] = keep["name"]
            drop["keepPath"] = keep["path"]
            duplicates.append(drop)

    # Empty dirs
    try:
        for entry in base.iterdir():
            if entry.is_dir():
                remaining = [
                    p for p in entry.rglob("*")
                    if p.is_file() and p.suffix.lstrip(".").lower() in AUDIO_EXTS
                ]
                if not remaining:
                    empty_dirs.append(str(entry))
    except OSError:
        pass

    result = {
        "scanned": scanned,
        "totalBytes": total_bytes,
        "corrupt": corrupt,
        "duplicates": duplicates,
        "emptyDirs": empty_dirs,
        "dirs": [basedir],
        "scannedAt": _now_iso(),
    }

    _user_cache_set(user_sub, basedir, result)
    return result


def _user_entry(path: Path, size: int, kind: str | None, note: str) -> dict[str, Any]:
    return {
        "path": str(path),
        "name": path.name,
        "size": size,
        "mtime": _user_mtime(path),
        "ext": path.suffix.lstrip(".").lower(),
        "kind": kind,
        "note": note,
    }


def _user_entry_from_prev(prev: dict[str, Any]) -> dict[str, Any]:
    out = dict(prev)
    out["note"] = "Duplicate"
    return out


def _user_mtime(path: Path) -> int:
    try:
        return int(path.stat().st_mtime)
    except OSError:
        return 0


# Per-user repair actions ────────────────────────────────────────────────────────

def user_validate_managed_path(raw: str, basedir: str | None = None) -> Path:
    p = Path(raw).resolve()
    dirs = [settings.MUSIC_DIR] if basedir is None else [basedir]
    for d in [Path(d) for d in dirs]:
        base = d.resolve()
        if base == p or base in p.parents:
            return p
    raise ValueError("path is outside the configured music directories")


def user_delete_corrupt_file(raw_path: str, basedir: str | None = None) -> dict[str, Any]:
    p = user_validate_managed_path(raw_path, basedir)
    if not p.exists():
        invalidate_user_cache()
        return {"deleted": False, "reason": "already gone"}
    if p.suffix.lstrip(".").lower() not in AUDIO_EXTS:
        raise ValueError("not an audio file")
    if p.stat().st_size >= MIN_VALID_BYTES and not _is_corrupt(p):
        raise ValueError("file is not corrupt despite previous report")
    try:
        p.unlink()
        invalidate_user_cache()
        return {"deleted": True, "path": str(p)}
    except OSError as e:
        invalidate_user_cache()
        return {"deleted": False, "reason": str(e)}


def user_delete_all_corrupt(basedir: str | None = None) -> dict[str, Any]:
    basedir_path = Path(basedir or settings.MUSIC_DIR)
    deleted = 0
    errors = 0
    for p in basedir_path.rglob("*"):
        if not p.is_file():
            continue
        if p.suffix.lstrip(".").lower() not in AUDIO_EXTS:
            continue
        try:
            size = p.stat().st_size
            if size < MIN_VALID_BYTES or _is_corrupt(p):
                p.unlink()
                deleted += 1
        except OSError:
            errors += 1
    invalidate_user_cache()
    return {"deleted": deleted, "errors": errors}


def user_delete_duplicate_file(raw_path: str, basedir: str | None = None) -> dict[str, Any]:
    p = user_validate_managed_path(raw_path, basedir)
    if not p.exists():
        invalidate_user_cache()
        return {"deleted": False, "reason": "already gone"}
    if p.suffix.lstrip(".").lower() not in AUDIO_EXTS:
        raise ValueError("not an audio file")
    try:
        p.unlink()
        invalidate_user_cache()
        return {"deleted": True, "path": str(p)}
    except OSError as e:
        invalidate_user_cache()
        return {"deleted": False, "reason": str(e)}


def user_delete_all_duplicates(basedir: str | None = None) -> dict[str, Any]:
    basedir_path = Path(basedir or settings.MUSIC_DIR)
    deleted = 0
    errors = 0
    seen: dict[tuple[str, str], list[tuple[Path, int]]] = {}
    for p in basedir_path.rglob("*"):
        if not p.is_file():
            continue
        if p.suffix.lstrip(".").lower() not in AUDIO_EXTS:
            continue
        try:
            title, artist = _read_title_artist(p)
            key = (title.strip().lower(), artist.strip().lower())
            if not title.strip():
                continue
            if key not in seen:
                seen[key] = []
            seen[key].append((p, _user_mtime(p)))
        except OSError:
            continue
    for key, entries in seen.items():
        entries.sort(key=lambda e: e[1])
        for p, _ in entries[1:]:
            try:
                p.unlink()
                deleted += 1
            except OSError:
                errors += 1
    invalidate_user_cache()
    return {"deleted": deleted, "errors": errors}


def user_delete_empty_dir(raw_path: str, basedir: str | None = None) -> dict[str, Any]:
    """Remove one folder the caller's scan reported as having no audio left."""
    p = user_validate_managed_path(raw_path, basedir)
    if not p.is_dir():
        invalidate_user_cache()
        return {"deleted": False, "reason": "not a directory"}
    try:
        # rmdir refuses a non-empty folder, which is the re-validation here:
        # a directory that gained files since the scan survives untouched.
        p.rmdir()
        invalidate_user_cache()
        return {"deleted": True, "path": str(p)}
    except OSError as e:
        invalidate_user_cache()
        return {"deleted": False, "reason": str(e)}


def user_prune_empty_dirs(basedir: str | None = None) -> dict[str, Any]:
    basedir_path = Path(basedir or settings.MUSIC_DIR)
    removed = 0
    for p in reversed(list(basedir_path.rglob("*"))):
        if not p.is_dir():
            continue
        try:
            p.rmdir()
            removed += 1
        except OSError:
            pass
    invalidate_user_cache()
    return {"removed": removed}
