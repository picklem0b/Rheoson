"""Recommendation API routes.

Provides endpoints for:
- Personalized home sections
- Autoplay candidate tracks
- Discovery/random recommendations
- Taste profile info
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_db
from app.services.recommendation_engine import (
    generate_recommendations,
    get_autoplay_candidates,
)
from app.services.taste_profiler import build_taste_profile, is_cold_start

router = APIRouter()


@router.get("/home")
async def get_home_recommendations(
    force: bool = Query(False, description="Force refresh recommendations"),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get personalized home page recommendations.

    Returns sections like "Made for you", "Discover", "More like...",
    each containing a list of track IDs ranked by relevance.
    """
    user_id = "anonymous"  # Will come from JWT when auth is enforced
    recs = await generate_recommendations(db, user_id, force_refresh=force)
    return {
        "sections": [s.model_dump() for s in recs.sections],
        "updated_at": recs.updated_at.isoformat(),
    }


@router.get("/autoplay")
async def get_autoplay(
    track_id: str = Query(..., description="Current track ID"),
    limit: int = Query(5, ge=1, le=20),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get autoplay candidates when the current track ends.

    Returns tracks similar to the given track, weighted by user taste.
    """
    user_id = "anonymous"
    candidates = await get_autoplay_candidates(db, user_id, track_id, limit=limit)
    return {"tracks": candidates}


@router.get("/discover")
async def get_discover(
    limit: int = Query(20, ge=1, le=50),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get discovery recommendations — diverse, exploratory tracks.

    Prioritizes tracks from genres/artists the user hasn't explored much.
    """
    user_id = "anonymous"
    recs = await generate_recommendations(db, user_id)

    # Find the discover section
    discover = next((s for s in recs.sections if s.section_id == "discover"), None)
    track_ids = discover.track_ids[:limit] if discover else []

    return {"track_ids": track_ids}


@router.get("/taste")
async def get_taste_profile(
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get the user's current taste profile (for debugging/display)."""
    user_id = "anonymous"
    profile = await build_taste_profile(db, user_id)
    return {
        "total_plays": profile.total_plays,
        "total_likes": profile.total_likes,
        "total_skips": profile.total_skips,
        "avg_completion_rate": profile.avg_completion_rate,
        "top_artists": [
            {"artist": a.artist, "score": a.score, "plays": a.play_count}
            for a in profile.top_artists[:10]
        ],
        "top_genres": [
            {"genre": g.genre, "score": g.score, "plays": g.play_count}
            for g in profile.top_genres[:10]
        ],
        "cold_start": is_cold_start(profile),
        "last_updated": profile.last_updated.isoformat(),
    }


@router.post("/refresh")
async def force_refresh(
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Force a full recommendation refresh."""
    user_id = "anonymous"
    recs = await generate_recommendations(db, user_id, force_refresh=True)
    return {
        "ok": True,
        "sections": len(recs.sections),
        "updated_at": recs.updated_at.isoformat(),
    }
