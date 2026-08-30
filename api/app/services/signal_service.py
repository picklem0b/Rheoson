"""Signal recording service — captures all user behavioral signals.

Every meaningful interaction (play, skip, like, search, etc.) is recorded
as a timestamped signal in MongoDB. These signals feed the recommendation
engine's taste profiler and scoring systems.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import structlog
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.recommendation import SignalType

log = structlog.get_logger()

# ── Write signals ─────────────────────────────────────────────

async def record_signal(
    db: AsyncIOMotorDatabase,
    *,
    user_id: str,
    signal: SignalType,
    track_id: str | None = None,
    artist: str | None = None,
    album: str | None = None,
    genre: str | None = None,
    query: str | None = None,
    progress: float | None = None,
    session_id: str | None = None,
    context: dict | None = None,
) -> None:
    """Insert a single behavioral signal into the signals collection."""
    doc = {
        "user_id":    user_id,
        "signal":     signal.value,
        "track_id":   track_id,
        "artist":     artist,
        "album":      album,
        "genre":      genre,
        "query":      query,
        "progress":   progress,
        "session_id": session_id,
        "context":    context or {},
        "timestamp":  datetime.now(timezone.utc),
    }
    try:
        await db.user_signals.insert_one(doc)
    except Exception as e:
        log.warning("signal.record.failed", error=str(e), signal=signal.value, user_id=user_id)


# ── Query signals ─────────────────────────────────────────────

async def get_signals(
    db: AsyncIOMotorDatabase,
    user_id: str,
    *,
    signal_type: SignalType | None = None,
    since: datetime | None = None,
    limit: int = 500,
) -> list[dict]:
    """Retrieve signals for a user, optionally filtered by type and time."""
    query: dict = {"user_id": user_id}
    if signal_type:
        query["signal"] = signal_type.value
    if since:
        query["timestamp"] = {"$gte": since}

    cursor = db.user_signals.find(query).sort("timestamp", -1).limit(limit)
    return await cursor.to_list(length=limit)


async def get_signal_counts(
    db: AsyncIOMotorDatabase,
    user_id: str,
    *,
    since: datetime | None = None,
) -> dict[str, int]:
    """Count signals by type for a user — used for profile building."""
    query: dict = {"user_id": user_id}
    if since:
        query["timestamp"] = {"$gte": since}

    pipeline = [
        {"$match": query},
        {"$group": {"_id": "$signal", "count": {"$sum": 1}}},
    ]
    cursor = db.user_signals.aggregate(pipeline)
    results = {}
    async for doc in cursor:
        results[doc["_id"]] = doc["count"]
    return results


async def get_play_history(
    db: AsyncIOMotorDatabase,
    user_id: str,
    *,
    days: int = 90,
    limit: int = 1000,
) -> list[dict]:
    """Get play signals within the last N days for profile building."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    return await get_signals(
        db, user_id,
        signal_type=SignalType.PLAY_START,
        since=since,
        limit=limit,
    )


async def get_artist_stats(
    db: AsyncIOMotorDatabase,
    user_id: str,
    *,
    days: int = 90,
) -> dict[str, dict]:
    """Aggregate per-artist play/like/skip stats for taste profiling."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    pipeline = [
        {"$match": {"user_id": user_id, "timestamp": {"$gte": since}, "artist": {"$ne": None}}},
        {"$group": {
            "_id": {"artist": "$artist", "signal": "$signal"},
            "count": {"$sum": 1},
            "avg_progress": {"$avg": "$progress"},
        }},
    ]

    artist_stats: dict[str, dict] = {}
    async for doc in db.user_signals.aggregate(pipeline):
        artist = doc["_id"]["artist"]
        signal = doc["_id"]["signal"]
        if artist not in artist_stats:
            artist_stats[artist] = {
                "plays": 0, "likes": 0, "skips": 0,
                "completions": 0, "total_progress": 0.0, "samples": 0,
            }
        stats = artist_stats[artist]
        if signal == "play_start":
            stats["plays"] += doc["count"]
        elif signal == "like":
            stats["likes"] += doc["count"]
        elif signal == "skip":
            stats["skips"] += doc["count"]
        elif signal == "play_complete":
            stats["completions"] += doc["count"]
        if doc["avg_progress"] is not None:
            stats["total_progress"] += doc["avg_progress"] * doc["count"]
            stats["samples"] += doc["count"]

    # Compute completion rate
    for stats in artist_stats.values():
        if stats["samples"] > 0:
            stats["completion_rate"] = stats["total_progress"] / stats["samples"]
        else:
            stats["completion_rate"] = 0.0

    return artist_stats


async def get_genre_stats(
    db: AsyncIOMotorDatabase,
    user_id: str,
    *,
    days: int = 90,
) -> dict[str, dict]:
    """Aggregate per-genre play stats for taste profiling."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    pipeline = [
        {"$match": {"user_id": user_id, "timestamp": {"$gte": since}, "genre": {"$ne": None}}},
        {"$group": {
            "_id": {"genre": "$genre", "signal": "$signal"},
            "count": {"$sum": 1},
        }},
    ]

    genre_stats: dict[str, dict] = {}
    async for doc in db.user_signals.aggregate(pipeline):
        genre = doc["_id"]["genre"]
        signal = doc["_id"]["signal"]
        if genre not in genre_stats:
            genre_stats[genre] = {"plays": 0, "likes": 0, "skips": 0}
        if signal == "play_start":
            genre_stats[genre]["plays"] += doc["count"]
        elif signal == "like":
            genre_stats[genre]["likes"] += doc["count"]
        elif signal == "skip":
            genre_stats[genre]["skips"] += doc["count"]

    return genre_stats


async def get_time_of_day_preferences(
    db: AsyncIOMotorDatabase,
    user_id: str,
    *,
    days: int = 30,
) -> dict[int, float]:
    """Analyze listening patterns by hour-of-day for context-aware recs."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    pipeline = [
        {"$match": {"user_id": user_id, "signal": "play_start", "timestamp": {"$gte": since}}},
        {"$project": {"hour": {"$hour": "$timestamp"}}},
        {"$group": {"_id": "$hour", "count": {"$sum": 1}}},
    ]

    hour_weights: dict[int, float] = {}
    max_count = 0
    async for doc in db.user_signals.aggregate(pipeline):
        hour_weights[doc["_id"]] = doc["count"]
        max_count = max(max_count, doc["count"])

    # Normalize to 0-1
    if max_count > 0:
        hour_weights = {h: c / max_count for h, c in hour_weights.items()}

    return hour_weights


async def get_total_signals(db: AsyncIOMotorDatabase, user_id: str) -> int:
    """Count total signals for a user — used to determine cold-start status."""
    return await db.user_signals.count_documents({"user_id": user_id})


async def get_distinct_artists_played(
    db: AsyncIOMotorDatabase,
    user_id: str,
    *,
    days: int = 30,
) -> list[str]:
    """Get distinct artists the user has played recently."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    pipeline = [
        {"$match": {"user_id": user_id, "signal": "play_start", "timestamp": {"$gte": since}, "artist": {"$ne": None}}},
        {"$group": {"_id": "$artist"}},
        {"$sort": {"_id": 1}},
    ]
    artists = []
    async for doc in db.user_signals.aggregate(pipeline):
        artists.append(doc["_id"])
    return artists
