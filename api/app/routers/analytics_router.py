"""Analytics API — listening stats, charts, and insights.

Provides endpoints for:
- Top tracks / artists / genres charts
- Listening time stats
- Monthly listening reports

Every endpoint requires a verified Clerk session and reports on THAT user's
signals only. There is no anonymous/guest dataset. MongoDB is required for
these aggregations.
"""

from __future__ import annotations

import structlog
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.core.database import db_available, get_db
from app.core.deps import get_current_user

log = structlog.get_logger()
router = APIRouter()

# Average track length used for estimated listening time when only play
# counts are available (play signals don't carry duration).
_AVG_MINUTES = 3.5


def _compute_streaks(dates: list[str]) -> dict:
    """Current + longest consecutive-day listening streak from 'YYYY-MM-DD'
    strings. Works with an unsorted list."""
    days = sorted({d for d in dates if d})
    if not days:
        return {"current_streak": 0, "longest_streak": 0}
    longest = 1
    cur = 1
    for i in range(1, len(days)):
        a = datetime.fromisoformat(days[i - 1]).date()
        b = datetime.fromisoformat(days[i]).date()
        if (b - a).days == 1:
            cur += 1
            longest = max(longest, cur)
        else:
            cur = 1
    # Current streak: consecutive days ending today or yesterday
    today = datetime.now(timezone.utc).date()
    current = 0
    cursor = today
    day_set = set(days)
    while str(cursor) in day_set:
        current += 1
        cursor = cursor - timedelta(days=1)
    if current == 0 and str(today - timedelta(days=1)) in day_set:
        # Streak ended yesterday — still report it as "in progress"-adjacent
        current = 0
    return {"current_streak": current, "longest_streak": longest}


@router.get("/stats")
async def listening_stats(
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Get overall listening statistics for the current user."""
    user_id = user["sub"]
    since_7d = datetime.now(timezone.utc) - timedelta(days=7)
    since_30d = datetime.now(timezone.utc) - timedelta(days=30)

    total_plays = await db.user_signals.count_documents({
        "user_id": user_id, "signal": "play_start"
    })
    plays_7d = await db.user_signals.count_documents({
        "user_id": user_id, "signal": "play_start",
        "timestamp": {"$gte": since_7d}
    })
    plays_30d = await db.user_signals.count_documents({
        "user_id": user_id, "signal": "play_start",
        "timestamp": {"$gte": since_30d}
    })

    liked_doc = await db.liked_tracks.find_one({"user_id": user_id})
    total_likes = len(liked_doc.get("track_ids", [])) if liked_doc else 0

    pipeline = [
        {"$match": {"user_id": user_id, "signal": "play_start", "timestamp": {"$gte": since_30d}, "artist": {"$ne": None}}},
        {"$group": {"_id": "$artist"}},
        {"$count": "total"},
    ]
    result = await db.user_signals.aggregate(pipeline).to_list(1)
    unique_artists = result[0]["total"] if result else 0

    pipeline = [
        {"$match": {"user_id": user_id, "signal": "play_start", "timestamp": {"$gte": since_30d}}},
        {"$project": {"day": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}}}},
        {"$group": {"_id": "$day"}},
        {"$count": "total"},
    ]
    result = await db.user_signals.aggregate(pipeline).to_list(1)
    active_days = result[0]["total"] if result else 0

    est_minutes = total_plays * _AVG_MINUTES

    # Consecutive-day listening streaks from play signals
    pipeline = [
        {"$match": {"user_id": user_id, "signal": "play_start"}},
        {"$project": {"day": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}}}},
        {"$group": {"_id": "$day"}},
    ]
    days = [doc["_id"] async for doc in db.user_signals.aggregate(pipeline)]
    streaks = _compute_streaks(days)

    return {
        "total_plays": total_plays,
        "plays_7d": plays_7d,
        "plays_30d": plays_30d,
        "total_likes": total_likes,
        "unique_artists_30d": unique_artists,
        "active_days_30d": active_days,
        "estimated_listening_hours": round(est_minutes / 60, 1),
        "current_streak": streaks["current_streak"],
        "longest_streak": streaks["longest_streak"],
    }


@router.get("/wrapped")
async def wrapped(
    year: int | None = Query(default=None, ge=2000, le=2100),
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Year-in-review — the Spotify Wrapped equivalent.

    Aggregates the user's play signals for the given year: top artists,
    top tracks (best-effort hydrated), total minutes, month activity,
    genre breakdown (from the taste profile / artist classification),
    and listening streaks. Every failure degrades to an empty report —
    this endpoint must never 500 a celebration.
    """
    user_id = user["sub"]
    if year is None:
        year = datetime.now(timezone.utc).year
    start = datetime(year, 1, 1, tzinfo=timezone.utc)
    end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    year_match = {
        "user_id": user_id,
        "signal": "play_start",
        "timestamp": {"$gte": start, "$lt": end},
    }

    report: dict = {
        "year": year,
        "top_artists": [], "top_tracks": [], "total_plays": 0,
        "total_minutes": 0, "months": [], "genres": [],
        "streaks": {"current_streak": 0, "longest_streak": 0},
        "top_decade": None,
    }

    try:
        total = await db.user_signals.count_documents(year_match)
        report["total_plays"] = total
        report["total_minutes"] = round(total * _AVG_MINUTES)

        # Top artists
        artist_pipe = [
            {"$match": {**year_match, "artist": {"$ne": None}}},
            {"$group": {"_id": "$artist", "plays": {"$sum": 1}}},
            {"$sort": {"plays": -1}},
            {"$limit": 10},
        ]
        report["top_artists"] = [
            {"artist": d["_id"], "plays": d["plays"]}
            async for d in db.user_signals.aggregate(artist_pipe)
        ]

        # Top tracks (ids → hydrated titles, best effort)
        track_pipe = [
            {"$match": {**year_match, "track_id": {"$ne": None}}},
            {"$group": {"_id": "$track_id", "plays": {"$sum": 1}}},
            {"$sort": {"plays": -1}},
            {"$limit": 10},
        ]
        top_tracks = [
            {"track_id": d["_id"], "plays": d["plays"]}
            async for d in db.user_signals.aggregate(track_pipe)
        ]
        if top_tracks:
            from app.routers.track_router import _hydrate_many
            hydrated = await _hydrate_many([t["track_id"] for t in top_tracks], limit=10)
            by_id = {t["id"]: t for t in hydrated}
            report["top_tracks"] = [
                {
                    "track_id": t["track_id"],
                    "title": by_id[t["track_id"]].get("title", "") if t["track_id"] in by_id else "",
                    "artist": (by_id[t["track_id"]].get("artist") or {}).get("name", "") if t["track_id"] in by_id else "",
                    "plays": t["plays"],
                }
                for t in top_tracks
            ]

        # Month activity
        month_pipe = [
            {"$match": year_match},
            {"$project": {"m": {"$month": "$timestamp"}}},
            {"$group": {"_id": "$m", "plays": {"$sum": 1}}},
        ]
        months_map = {}
        async for d in db.user_signals.aggregate(month_pipe):
            months_map[d["_id"]] = d["plays"]
        report["months"] = [
            {"month": m, "plays": months_map.get(m, 0)} for m in range(1, 13)
        ]

        # Genre breakdown from top artists
        if report["top_artists"]:
            from app.services.taste_utils import classify_artist_genres
            genre_counts: dict[str, int] = {}
            for a in report["top_artists"]:
                genres = classify_artist_genres(a["artist"]) or ["Other"]
                share = max(1, a["plays"] // len(genres))
                for g in genres:
                    genre_counts[g] = genre_counts.get(g, 0) + share
            report["genres"] = sorted(
                ({"genre": g, "plays": p} for g, p in genre_counts.items()),
                key=lambda x: x["plays"],
                reverse=True,
            )[:8]

        # Streaks
        day_pipe = [
            {"$match": year_match},
            {"$project": {"day": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}}}},
            {"$group": {"_id": "$day"}},
        ]
        days = [d["_id"] async for d in db.user_signals.aggregate(day_pipe)]
        report["streaks"] = _compute_streaks(days)
    except Exception as e:
        log.warning("analytics.wrapped.failed", user_id=user_id, error=str(e))

    return report


@router.get("/top-artists")
async def top_artists(
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Get top artists by play count for a time period."""
    user_id = user["sub"]
    since = datetime.now(timezone.utc) - timedelta(days=days)

    pipeline = [
        {"$match": {
            "user_id": user_id, "signal": "play_start",
            "timestamp": {"$gte": since}, "artist": {"$ne": None}
        }},
        {"$group": {"_id": "$artist", "plays": {"$sum": 1}}},
        {"$sort": {"plays": -1}},
        {"$limit": limit},
    ]

    artists = []
    async for doc in db.user_signals.aggregate(pipeline):
        artists.append({"artist": doc["_id"], "plays": doc["plays"]})

    return {"artists": artists, "days": days}


@router.get("/top-tracks")
async def top_tracks(
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Get top tracks by play count for a time period."""
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

    tracks = []
    async for doc in db.user_signals.aggregate(pipeline):
        tracks.append({"track_id": doc["_id"], "plays": doc["plays"]})

    return {"tracks": tracks, "days": days}


@router.get("/listening-by-hour")
async def listening_by_hour(
    days: int = Query(30, ge=1, le=365),
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Get listening activity broken down by hour of day."""
    user_id = user["sub"]
    since = datetime.now(timezone.utc) - timedelta(days=days)

    pipeline = [
        {"$match": {"user_id": user_id, "signal": "play_start", "timestamp": {"$gte": since}}},
        {"$project": {"hour": {"$hour": "$timestamp"}}},
        {"$group": {"_id": "$hour", "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]

    hours = {}
    async for doc in db.user_signals.aggregate(pipeline):
        hours[doc["_id"]] = doc["count"]

    result = [{"hour": h, "plays": hours.get(h, 0)} for h in range(24)]
    return {"hours": result, "days": days}


@router.get("/listening-by-day")
async def listening_by_day(
    days: int = Query(7, ge=1, le=30),
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Get listening activity broken down by day of week."""
    user_id = user["sub"]
    since = datetime.now(timezone.utc) - timedelta(days=days * 2)

    pipeline = [
        {"$match": {"user_id": user_id, "signal": "play_start", "timestamp": {"$gte": since}}},
        {"$project": {"dayOfWeek": {"$dayOfWeek": "$timestamp"}}},
        {"$group": {"_id": "$dayOfWeek", "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]

    day_names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    days_map = {}
    async for doc in db.user_signals.aggregate(pipeline):
        idx = (doc["_id"] - 2) % 7
        days_map[idx] = doc["count"]

    result = [{"day": day_names[i], "plays": days_map.get(i, 0)} for i in range(7)]
    return {"days": result, "period_days": days}
