"""Smart Playlists — auto-generated dynamic playlists based on listening behavior.

These playlists update every time they're opened:
- Most Played: tracks with highest play count
- Recently Added: tracks sorted by file creation date
- Top Rated: liked tracks sorted by play count
- Discovery: tracks the user hasn't explored yet
- Time Capsule: tracks played exactly N days ago

Guest mode removed: every route requires a verified session and aggregates
that user's signals only.
"""

from __future__ import annotations

import asyncio
import structlog
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_db
from app.core.deps import get_current_user
from app.routers.track_router import _build_index, _hydrate_track

log = structlog.get_logger()
router = APIRouter()


@router.get("/most-played")
async def most_played(
    limit: int = Query(25, ge=1, le=100),
    days: int = Query(90, ge=1, le=365),
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Tracks with highest play count in the given time window."""
    user_id = user["sub"]
    since = datetime.now(timezone.utc) - timedelta(days=days)

    pipeline = [
        {"$match": {
            "user_id": user_id, "signal": "play_start",
            "timestamp": {"$gte": since}, "track_id": {"$ne": None}
        }},
        {"$group": {"_id": "$track_id", "plays": {"$sum": 1}}},
        {"$sort": {"plays": -1}},
        {"$limit": limit},
    ]

    track_ids = []
    async for doc in db.user_signals.aggregate(pipeline):
        track_ids.append(doc["_id"])

    sem = asyncio.Semaphore(10)

    async def _safe(tid):
        async with sem:
            return await _hydrate_track(tid)

    hydrated = await asyncio.gather(*[_safe(tid) for tid in track_ids])
    tracks = [t for t in hydrated if t is not None]

    return {
        "title": f"Most Played ({days}d)",
        "tracks": tracks,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/recently-added")
async def recently_added(
    limit: int = Query(25, ge=1, le=100),
    _user: dict = Depends(get_current_user),
):
    """Most recently downloaded/added tracks — shared instance library."""
    idx = await _build_index()
    tracks = sorted(
        idx.values(),
        key=lambda t: t.get("filePath", ""),
        reverse=True,
    )
    return {
        "title": "Recently Added",
        "tracks": tracks[:limit],
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/discover")
async def discover(
    limit: int = Query(20, ge=1, le=50),
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Tracks the user has in their library but rarely plays — hidden gems."""
    user_id = user["sub"]
    idx = await _build_index()
    since = datetime.now(timezone.utc) - timedelta(days=90)

    pipeline = [
        {"$match": {
            "user_id": user_id, "signal": "play_start",
            "timestamp": {"$gte": since}, "track_id": {"$ne": None}
        }},
        {"$group": {"_id": "$track_id", "plays": {"$sum": 1}}},
    ]
    play_counts = {}
    async for doc in db.user_signals.aggregate(pipeline):
        play_counts[doc["_id"]] = doc["plays"]

    candidates = []
    for tid, track in idx.items():
        plays = play_counts.get(tid, 0)
        if plays <= 2:  # rarely played
            candidates.append({**track, "_plays": plays})

    candidates.sort(key=lambda t: t["_plays"])
    return {
        "title": "Discover Your Library",
        "tracks": candidates[:limit],
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/time-capsule")
async def time_capsule(
    days_ago: int = Query(30, ge=7, le=365),
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Tracks you listened to exactly N days ago — nostalgic rediscovery."""
    user_id = user["sub"]
    target_date = datetime.now(timezone.utc) - timedelta(days=days_ago)
    start = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)

    pipeline = [
        {"$match": {
            "user_id": user_id, "signal": "play_start",
            "timestamp": {"$gte": start, "$lt": end},
            "track_id": {"$ne": None}
        }},
        {"$group": {"_id": "$track_id"}},
        {"$limit": 25},
    ]

    track_ids = []
    async for doc in db.user_signals.aggregate(pipeline):
        track_ids.append(doc["_id"])

    sem = asyncio.Semaphore(10)

    async def _safe(tid):
        async with sem:
            return await _hydrate_track(tid)

    hydrated = await asyncio.gather(*[_safe(tid) for tid in track_ids])
    tracks = [t for t in hydrated if t is not None]

    date_str = start.strftime("%B %d, %Y")
    return {
        "title": f"Time Capsule — {date_str}",
        "subtitle": f"What you were listening to {days_ago} days ago",
        "tracks": tracks,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
