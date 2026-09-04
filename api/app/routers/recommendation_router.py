"""Recommendation API routes.

Provides endpoints for:
- Personalized home sections
- Autoplay candidate tracks
- Discovery/random recommendations
- Taste profile info

Uses optional Clerk auth — guests get trending/cold-start recommendations,
authenticated users get personalized recommendations.

Works WITHOUT MongoDB — falls back to local play history + library scan
when the database is unavailable.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, Query

from app.core.config import settings
from app.core.database import db_available, get_db
from app.core.deps import get_optional_user

router = APIRouter()


def _get_user_id(user: dict | None) -> str:
    """Extract user ID from Clerk claims, or return 'anonymous' for guests."""
    if user and user.get("sub"):
        return user["sub"]
    return "anonymous"


# ── Local play history helpers ─────────────────────────────────
# Reads come from app.services.local_history — the JSON mirror every
# play/like write also lands in, so local mode reflects real activity.


async def _load_local_history() -> list[dict]:
    from app.services.local_history import read_history_local
    return await read_history_local()


async def _load_local_liked() -> list[str]:
    from app.services.local_history import read_liked_local
    return await read_liked_local()


async def _build_local_taste() -> dict:
    """Build a simple taste profile from local play history + liked tracks."""
    history = await _load_local_history()
    liked = await _load_local_liked()

    # Count plays per track
    play_counts: dict[str, int] = {}
    for entry in history:
        tid = entry.get("trackId") or entry.get("id", "")
        if tid:
            play_counts[tid] = play_counts.get(tid, 0) + 1

    return {
        "play_counts": play_counts,
        "liked_ids": set(liked),
        "total_plays": len(history),
        "total_likes": len(liked),
    }


# ── Routes ─────────────────────────────────────────────────────

@router.get("/home")
async def get_home_recommendations(
    force: bool = Query(False, description="Force refresh recommendations"),
    user: dict | None = Depends(get_optional_user),
):
    """Get personalized home page recommendations.

    Works without MongoDB — uses local play history + library + YTMusic trending.
    """
    user_id = _get_user_id(user)

    if db_available():
        # Full personalized recommendations via MongoDB
        try:
            db = get_db()
            from app.services.recommendation_engine import generate_recommendations
            recs = await generate_recommendations(db, user_id, force_refresh=force)
            return {
                "sections": [s.model_dump() for s in recs.sections],
                "updated_at": recs.updated_at.isoformat(),
            }
        except Exception:
            pass  # Fall through to local mode

    # ── Local mode: no MongoDB ─────────────────────────────────
    taste = await _build_local_taste()
    sections = []

    # Section 1: For You — based on play history
    if taste["total_plays"] > 0:
        # Get top played track IDs
        top_played = sorted(
            taste["play_counts"].items(),
            key=lambda x: x[1],
            reverse=True,
        )[:20]
        track_ids = [tid for tid, _ in top_played]
        sections.append({
            "section_id": "for_you",
            "title": "Your favorites",
            "track_ids": track_ids,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        })

    # Section 2: Trending — always available via YTMusic
    try:
        from app.services.ytmusic_service import get_trending
        trending = await get_trending()
        trending_ids = [t.get("id", "") for t in trending[:20] if t.get("id")]
        if trending_ids:
            sections.append({
                "section_id": "trending",
                "title": "Popular right now",
                "track_ids": trending_ids,
                "generated_at": datetime.now(timezone.utc).isoformat(),
            })
    except Exception:
        pass

    # Section 3: Discover — diverse mix from library + trending
    try:
        from app.routers.track_router import _build_index
        idx = await _build_index()
        library_ids = [tid for tid in idx.keys() if tid not in taste["liked_ids"]][:15]
        if library_ids:
            sections.append({
                "section_id": "discover",
                "title": "From your library",
                "track_ids": library_ids,
                "generated_at": datetime.now(timezone.utc).isoformat(),
            })
    except Exception:
        pass

    # Section 4: Liked tracks
    if taste["liked_ids"]:
        sections.append({
            "section_id": "recent_favorites",
            "title": "Your liked songs",
            "track_ids": list(taste["liked_ids"])[:15],
            "generated_at": datetime.now(timezone.utc).isoformat(),
        })

    return {
        "sections": sections,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/autoplay")
async def get_autoplay(
    track_id: str = Query(..., description="Current track ID"),
    limit: int = Query(5, ge=1, le=20),
    user: dict | None = Depends(get_optional_user),
):
    """Get autoplay candidates when the current track ends.

    Works without MongoDB — searches YTMusic for similar tracks.
    """
    user_id = _get_user_id(user)

    if db_available():
        try:
            db = get_db()
            from app.services.recommendation_engine import get_autoplay_candidates
            candidates = await get_autoplay_candidates(db, user_id, track_id, limit=limit)
            return {"tracks": candidates}
        except Exception:
            pass

    # ── Local mode ─────────────────────────────────────────────
    try:
        from app.routers.track_router import _hydrate_track
        current = await _hydrate_track(track_id)
    except Exception:
        current = None

    if not current:
        return {"tracks": []}

    artist = current.get("artist", {}).get("name", "") if isinstance(current.get("artist"), dict) else str(current.get("artist", ""))

    try:
        from app.services.ytmusic_service import search as yt_search
        results = await yt_search(f"{artist} similar", limit=limit * 3)
        candidates = []
        for t in results.get("tracks", []):
            tid = t.get("id", "")
            if tid and tid != track_id:
                candidates.append({
                    "track_id": tid,
                    "title": t.get("title", ""),
                    "artist": t.get("artist", {}).get("name", "") if isinstance(t.get("artist"), dict) else str(t.get("artist", "")),
                    "score": 0.5,
                })
        candidates.sort(key=lambda x: x["score"], reverse=True)
        return {"tracks": candidates[:limit]}
    except Exception:
        return {"tracks": []}


@router.get("/discover")
async def get_discover(
    limit: int = Query(20, ge=1, le=50),
    user: dict | None = Depends(get_optional_user),
):
    """Get discovery recommendations — diverse, exploratory tracks."""
    user_id = _get_user_id(user)

    if db_available():
        try:
            db = get_db()
            from app.services.recommendation_engine import generate_recommendations
            recs = await generate_recommendations(db, user_id)
            discover = next((s for s in recs.sections if s.section_id == "discover"), None)
            track_ids = discover.track_ids[:limit] if discover else []
            return {"track_ids": track_ids}
        except Exception:
            pass

    # ── Local mode: trending as discovery ──────────────────────
    try:
        from app.services.ytmusic_service import get_trending
        trending = await get_trending()
        track_ids = [t.get("id", "") for t in trending[:limit] if t.get("id")]
        return {"track_ids": track_ids}
    except Exception:
        return {"track_ids": []}


@router.get("/taste")
async def get_taste_profile(
    user: dict | None = Depends(get_optional_user),
):
    """Get the user's current taste profile."""
    user_id = _get_user_id(user)

    if db_available():
        try:
            db = get_db()
            from app.services.taste_profiler import build_taste_profile, is_cold_start
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
        except Exception:
            pass

    # ── Local mode ─────────────────────────────────────────────
    taste = await _build_local_taste()
    return {
        "total_plays": taste["total_plays"],
        "total_likes": taste["total_likes"],
        "total_skips": 0,
        "avg_completion_rate": 0.0,
        "top_artists": [],
        "top_genres": [],
        "cold_start": taste["total_plays"] < 5,
        "last_updated": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/refresh")
async def force_refresh(
    user: dict | None = Depends(get_optional_user),
):
    """Force a full recommendation refresh."""
    user_id = _get_user_id(user)

    if db_available():
        try:
            db = get_db()
            from app.services.recommendation_engine import generate_recommendations
            recs = await generate_recommendations(db, user_id, force_refresh=True)
            return {
                "ok": True,
                "sections": len(recs.sections),
                "updated_at": recs.updated_at.isoformat(),
            }
        except Exception:
            pass

    return {"ok": True, "sections": 0, "updated_at": datetime.now(timezone.utc).isoformat()}
