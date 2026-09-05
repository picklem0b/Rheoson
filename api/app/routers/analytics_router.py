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

from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.core.database import get_db
from app.core.deps import get_current_user

router = APIRouter()


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

    est_minutes = total_plays * 3.5

    return {
        "total_plays": total_plays,
        "plays_7d": plays_7d,
        "plays_30d": plays_30d,
        "total_likes": total_likes,
        "unique_artists_30d": unique_artists,
        "active_days_30d": active_days,
        "estimated_listening_hours": round(est_minutes / 60, 1),
    }


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
