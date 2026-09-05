"""Per-user local play-history and liked-track mirror.

MongoDB is optional in Rheoson: every play/like write is ALSO persisted to
small JSON files next to the music library, and every read falls back to
those files when the database is unavailable. That is what keeps Recently
played, liked tracks, and the local recommendation engine alive on installs
without MongoDB.

Files are keyed by the authenticated user (sha256 of the Clerk `sub`), so
there is no shared "anonymous" state: `user_a` can never read or overwrite
`user_b`'s history. Guest mode was removed — every caller must pass the
identity of the verified session.

File I/O is tiny and synchronous; writes are serialized per file with an
asyncio lock so concurrent plays/likes can't interleave read-modify-write.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import structlog
from datetime import datetime, timezone
from pathlib import Path

from app.core.config import settings

log = structlog.get_logger()

_history_lock = asyncio.Lock()
_liked_lock   = asyncio.Lock()

HISTORY_MAX = 200


def _user_digest(user_id: str) -> str:
    """Stable, filesystem-safe per-user key derived from the Clerk sub."""
    return hashlib.sha256(user_id.encode("utf-8")).hexdigest()[:16]


def _history_file(user_id: str) -> Path:
    return Path(settings.MUSIC_DIR) / f".history-{_user_digest(user_id)}.json"


def _liked_file(user_id: str) -> Path:
    return Path(settings.MUSIC_DIR) / f".liked-{_user_digest(user_id)}.json"


def _read_json(path: Path):
    try:
        if not path.exists():
            return []
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _write_json(path: Path, data: list) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(path.name + ".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f)
        tmp.replace(path)
    except Exception:
        log.warning("local_history.write_failed", path=str(path), exc_info=True)


# ── Play history ──────────────────────────────────────────────


async def record_play_local(user_id: str, track_id: str) -> None:
    """Prepend a play to the user's local history file (most recent first)."""
    async with _history_lock:
        entries = _read_json(_history_file(user_id))
        entries = [e for e in entries if e.get("id") != track_id]
        entries.insert(
            0,
            {"id": track_id, "playedAt": datetime.now(timezone.utc).isoformat()},
        )
        _write_json(_history_file(user_id), entries[:HISTORY_MAX])


async def read_history_local(user_id: str) -> list[dict]:
    """The user's local play history, most recent first."""
    async with _history_lock:
        return _read_json(_history_file(user_id))


async def clear_history_local(user_id: str) -> None:
    async with _history_lock:
        _write_json(_history_file(user_id), [])


# ── Liked tracks ──────────────────────────────────────────────


async def read_liked_local(user_id: str) -> list[str]:
    """The user's local liked-track ids, most recently liked first."""
    async with _liked_lock:
        return [str(i) for i in _read_json(_liked_file(user_id))]


async def like_local(user_id: str, track_id: str) -> list[str]:
    async with _liked_lock:
        liked = [str(i) for i in _read_json(_liked_file(user_id))]
        if track_id not in liked:
            liked.insert(0, track_id)
        _write_json(_liked_file(user_id), liked)
        return liked


async def unlike_local(user_id: str, track_id: str) -> list[str]:
    async with _liked_lock:
        liked = [str(i) for i in _read_json(_liked_file(user_id)) if str(i) != track_id]
        _write_json(_liked_file(user_id), liked)
        return liked
