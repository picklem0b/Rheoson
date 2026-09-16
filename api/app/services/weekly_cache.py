"""Weekly-bucketed cache for chart-style data.

Charts and category leaders change on a weekly cadence, but the upstream
lookups (YouTube Music browse calls) are slow and rate-limited. This module
keeps one entry per (bucket, key) on disk so:

  - a given ISO week is fetched from upstream exactly once per key
  - every request inside that week is served from the local file (instant)
  - the cache survives restarts, which matters on Termux where the process is
    restarted often
  - when the week rolls over the stale entry is simply ignored, so the next
    request refreshes it without any cron job

Storage lives next to the music library (``MUSIC_DIR/.cache/weekly.json``), on
the same volume as everything else Rheoson persists. Writes are atomic
(temp file + replace) and serialized with an asyncio lock; a corrupt or
unreadable file degrades to "no cache" rather than raising, because a cache
failure must never break the feature it accelerates.
"""

from __future__ import annotations

import asyncio
import json
import structlog
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from app.core.config import settings

log = structlog.get_logger()

_lock = asyncio.Lock()

# Keep the file from growing without bound: entries older than this many
# buckets are dropped on write.
_MAX_BUCKETS = 8


def current_bucket() -> str:
    """Cache bucket for the current week, e.g. ``2026-W37``.

    ISO weeks start on Monday, which is what "refreshed weekly" means to a
    user reading a chart.
    """
    now = datetime.now(timezone.utc)
    year, week, _ = now.isocalendar()
    return f"{year}-W{week:02d}"


def bucket_at(dt: datetime) -> str:
    """The bucket ``dt`` falls into (UTC-normalized)."""
    dt = dt.astimezone(timezone.utc)
    year, week, _ = dt.isocalendar()
    return f"{year}-W{week:02d}"


def next_bucket() -> str:
    """The bucket that will be current 24 hours from now.

    The weekly prewarm runs Sunday 23:30 UTC — still inside the old ISO week
    (which flips Monday 00:00) — so it must write into the *upcoming* bucket
    explicitly. ``now + 24h`` lands Monday 23:30, inside the new week.
    """
    return bucket_at(datetime.now(timezone.utc) + timedelta(hours=24))


def _cache_file() -> Path:
    return Path(settings.MUSIC_DIR) / ".cache" / "weekly.json"


def _read_all() -> dict[str, Any]:
    path = _cache_file()
    try:
        if not path.exists():
            return {}
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _write_all(data: dict[str, Any]) -> None:
    path = _cache_file()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(path.name + ".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f)
        tmp.replace(path)
    except Exception:
        log.warning("weekly_cache.write_failed", path=str(path), exc_info=True)


def _prune(data: dict[str, Any], keep_bucket: str) -> dict[str, Any]:
    """Drop buckets that are no longer recent (keeps the file small)."""
    buckets = sorted({k.split("|", 1)[0] for k in data})
    if len(buckets) <= _MAX_BUCKETS:
        return data
    allowed = set(buckets[-_MAX_BUCKETS:])
    allowed.add(keep_bucket)
    return {k: v for k, v in data.items() if k.split("|", 1)[0] in allowed}


async def get(key: str, bucket: str | None = None) -> Any | None:
    """Return the cached value for this week, or None when absent."""
    bucket = bucket or current_bucket()
    async with _lock:
        data = _read_all()
    return data.get(f"{bucket}|{key}")


async def set(key: str, value: Any, bucket: str | None = None) -> None:
    """Store a value for the given week (defaults to the current one)."""
    bucket = bucket or current_bucket()
    async with _lock:
        data = _read_all()
        data[f"{bucket}|{key}"] = value
        _write_all(_prune(data, bucket))


async def get_or_set(key: str, producer, bucket: str | None = None) -> Any:
    """Return the cached value, calling ``producer`` (async) on a miss.

    A producer that raises or returns an empty/None value is NOT cached, so a
    transient upstream failure doesn't poison the whole week.
    """
    cached = await get(key, bucket)
    if cached is not None:
        return cached

    produced = await producer()
    if produced:
        await set(key, produced, bucket)
    return produced


async def clear() -> None:
    """Drop the whole cache (used by the storage settings panel)."""
    async with _lock:
        _write_all({})


async def prewarm_categories(track_limit: int = 5) -> dict[str, int]:
    """Fetch every category's top tracks for the UPCOMING week, ahead of time.

    Called by the Sunday-evening cron so users never see a spinner on a
    category tile — the list for the new week was already fetched and cached
    before the week rolled over. Writes into ``next_bucket()`` explicitly
    because the run happens while the old bucket is still current.

    A per-category failure is logged and skipped: one dead genre must not
    block the rest. Returns {"filled": n, "skipped": m, "already": k}.
    """
    from app.services.ytmusic_service import CATEGORIES, get_category_top

    bucket = next_bucket()
    filled = skipped = already = 0
    for meta in CATEGORIES:
        slug = meta["slug"]
        key = f"category:{slug}:{track_limit}"
        if await get(key, bucket) is not None:
            already += 1
            continue
        try:
            tracks = await get_category_top(slug, limit=track_limit)
            if tracks:
                await set(key, {"week": bucket, "tracks": tracks}, bucket)
                filled += 1
            else:
                skipped += 1
                log.warning("weekly_cache.prewarm.empty", category=slug)
        except Exception as e:
            skipped += 1
            log.warning("weekly_cache.prewarm.failed", category=slug, error=str(e))
    log.info(
        "weekly_cache.prewarm.done",
        bucket=bucket,
        filled=filled,
        skipped=skipped,
        already=already,
    )
    return {"filled": filled, "skipped": skipped, "already": already}
