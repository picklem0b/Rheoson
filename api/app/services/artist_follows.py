"""Per-user artist follows.

Mirrors the local_history approach: a small JSON file per user next to the
library, so following an artist works even when MongoDB is unavailable.

Each follow records enough about the artist to render a row without a network
call (id, name, image, monthly listeners) plus the newest release we have seen
for them. Comparing the stored release to a freshly fetched one is what powers
"notify me about their latest song" — and the newest release is also fed to the
recommendation engine as an auto-curated top pick for that user.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import structlog
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.config import settings

log = structlog.get_logger()

_lock = asyncio.Lock()

MAX_FOLLOWS = 300


def _digest(user_id: str) -> str:
    return hashlib.sha256(user_id.encode("utf-8")).hexdigest()[:16]


def _file(user_id: str) -> Path:
    return Path(settings.MUSIC_DIR) / f".following-{_digest(user_id)}.json"


def _read(user_id: str) -> list[dict[str, Any]]:
    path = _file(user_id)
    try:
        if not path.exists():
            return []
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _write(user_id: str, data: list[dict[str, Any]]) -> None:
    path = _file(user_id)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(path.name + ".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f)
        tmp.replace(path)
    except Exception:
        log.warning("artist_follows.write_failed", path=str(path), exc_info=True)


async def list_follows(user_id: str) -> list[dict[str, Any]]:
    """Followed artists, most recently followed first."""
    async with _lock:
        return _read(user_id)


async def is_following(user_id: str, artist_id: str) -> bool:
    async with _lock:
        return any(f.get("id") == artist_id for f in _read(user_id))


async def follow(
    user_id: str,
    artist_id: str,
    *,
    name: str = "",
    image_url: str = "",
    monthly_listeners: int = 0,
    latest_release: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Follow an artist (idempotent). Returns the stored follow record."""
    async with _lock:
        follows = _read(user_id)
        existing = next((f for f in follows if f.get("id") == artist_id), None)
        if existing:
            # Refresh the cached metadata but keep the original followed_at so
            # the list order stays stable across re-follows.
            if name:
                existing["name"] = name
            if image_url:
                existing["imageUrl"] = image_url
            if monthly_listeners:
                existing["monthlyListeners"] = monthly_listeners
            if latest_release:
                existing["latestRelease"] = latest_release
            existing["updatedAt"] = datetime.now(timezone.utc).isoformat()
            _write(user_id, follows)
            return existing

        record = {
            "id": artist_id,
            "name": name,
            "imageUrl": image_url,
            "monthlyListeners": monthly_listeners,
            "latestRelease": latest_release,
            "followedAt": datetime.now(timezone.utc).isoformat(),
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }
        follows.insert(0, record)
        _write(user_id, follows[:MAX_FOLLOWS])
        return record


async def unfollow(user_id: str, artist_id: str) -> bool:
    async with _lock:
        follows = _read(user_id)
        remaining = [f for f in follows if f.get("id") != artist_id]
        changed = len(remaining) != len(follows)
        if changed:
            _write(user_id, remaining)
        return changed


async def update_latest_release(
    user_id: str,
    artist_id: str,
    release: dict[str, Any],
) -> bool:
    """Record a new release for a followed artist.

    Returns True when the release is newer than what we had stored — i.e. when
    the caller should surface a "new song" notification. Ids are compared first
    because two entries for the same release must never notify twice.
    """
    if not release or not release.get("id"):
        return False

    async with _lock:
        follows = _read(user_id)
        target = next((f for f in follows if f.get("id") == artist_id), None)
        if target is None:
            return False

        previous = target.get("latestRelease") or {}
        if previous.get("id") == release["id"]:
            return False

        target["latestRelease"] = release
        target["updatedAt"] = datetime.now(timezone.utc).isoformat()
        _write(user_id, follows)
        return True


async def mark_release_seen(user_id: str, artist_id: str, release_id: str) -> bool:
    """Remember that a release has been surfaced to the user.

    Kept separate from `update_latest_release` (which is idempotent for an
    unchanged release) so that marking-as-seen never looks like a new release.
    """
    if not release_id:
        return False

    async with _lock:
        follows = _read(user_id)
        target = next((f for f in follows if f.get("id") == artist_id), None)
        if target is None:
            return False
        target["releaseSeenAt"] = release_id
        _write(user_id, follows)
        return True
