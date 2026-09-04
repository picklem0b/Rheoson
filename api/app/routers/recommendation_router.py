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
from app.services.taste_utils import compute_persona

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
    """Get the user's current taste profile.

    Returns most-replayed tracks, favourite artists and genres, and a
    listener persona — from MongoDB signals when available, otherwise
    from the local history/liked mirror files.
    """
    user_id = _get_user_id(user)

    if db_available():
        try:
            db = get_db()
            from app.services.taste_profiler import build_taste_profile, is_cold_start
            profile = await build_taste_profile(db, user_id)
            top_artists = [
                {"artist": a.artist, "score": a.score, "plays": a.play_count}
                for a in profile.top_artists[:10]
            ]
            top_genres = [
                {"genre": g.genre, "score": g.score, "plays": g.play_count}
                for g in profile.top_genres[:10]
            ]
            top_tracks = await _top_tracks_mongo(db, user_id, limit=5)
            total_plays = profile.total_plays
            top_artist_share = (
                (top_artists[0]["plays"] / total_plays) if top_artists and total_plays > 0 else 0.0
            )
            persona = compute_persona(
                total_plays=total_plays,
                top_artist_share=top_artist_share,
                genre_count=len(top_genres),
                completion_rate=profile.avg_completion_rate,
                like_ratio=profile.total_likes / max(total_plays, 1),
            )
            return {
                "total_plays": total_plays,
                "total_likes": profile.total_likes,
                "total_skips": profile.total_skips,
                "avg_completion_rate": profile.avg_completion_rate,
                "top_artists": top_artists,
                "top_genres": top_genres,
                "top_tracks": top_tracks,
                "persona": persona,
                "cold_start": is_cold_start(profile),
                "last_updated": profile.last_updated.isoformat(),
            }
        except Exception:
            pass

    # ── Local mode: derive everything from the mirror files ────
    return await _local_taste_profile()


# ── Taste helpers ─────────────────────────────────────────────

async def _top_tracks_mongo(db, user_id: str, limit: int = 5) -> list[dict]:
    """Most replayed tracks from Mongo signals (play_start counts)."""
    from app.routers.track_router import _hydrate_many

    pipeline = [
        {"$match": {"user_id": user_id, "signal": "play_start", "track_id": {"$ne": None}}},
        {"$group": {"_id": "$track_id", "plays": {"$sum": 1}}},
        {"$sort": {"plays": -1}},
        {"$limit": limit},
    ]
    rows: list[dict] = []
    async for doc in db.user_signals.aggregate(pipeline):
        rows.append({"track_id": doc["_id"], "plays": doc["plays"]})
    if not rows:
        return []

    hydrated = await _hydrate_many([r["track_id"] for r in rows], limit=limit)
    by_id = {t["id"]: t for t in hydrated}
    out = []
    for r in rows:
        t = by_id.get(r["track_id"])
        if not t:
            continue
        artist = t.get("artist", {})
        out.append({
            "track_id": r["track_id"],
            "title": t.get("title", ""),
            "artist": artist.get("name", "") if isinstance(artist, dict) else str(artist),
            "plays": r["plays"],
        })
    return out


async def _local_taste_profile() -> dict:
    """Taste profile derived from the local history/liked mirror files."""
    from app.routers.track_router import _hydrate_many
    from app.services.taste_utils import classify_artist_genres

    history = await _load_local_history()
    liked_ids = set(await _load_local_liked())
    total_plays = len(history)

    # Recency-weighted score per track id (history is most-recent-first)
    plays_by_id: dict[str, int] = {}
    score_by_id: dict[str, float] = {}
    for idx, entry in enumerate(history):
        tid = entry.get("trackId") or entry.get("id", "")
        if not tid:
            continue
        plays_by_id[tid] = plays_by_id.get(tid, 0) + 1
        score_by_id[tid] = score_by_id.get(tid, 0.0) + 2 ** (-idx / 150.0)

    top_ids = sorted(score_by_id, key=lambda t: score_by_id[t], reverse=True)[:10]
    hydrated = await _hydrate_many(top_ids)
    by_id = {t["id"]: t for t in hydrated}

    def _artist_name(t: dict) -> str:
        artist = t.get("artist", {})
        return artist.get("name", "") if isinstance(artist, dict) else str(artist)

    artist_stats: dict[str, dict] = {}
    top_tracks: list[dict] = []
    for tid in top_ids:
        t = by_id.get(tid)
        if not t:
            continue
        artist = _artist_name(t) or "Unknown Artist"
        plays = plays_by_id[tid]
        st = artist_stats.setdefault(artist, {"plays": 0, "score": 0.0})
        st["plays"] += plays
        st["score"] += score_by_id[tid]
        if len(top_tracks) < 5:
            top_tracks.append({
                "track_id": tid,
                "title": t.get("title", ""),
                "artist": artist,
                "plays": plays,
            })

    top_artists = [
        {"artist": a, "score": round(st["score"], 3), "plays": st["plays"]}
        for a, st in artist_stats.items()
    ]
    top_artists.sort(key=lambda x: x["score"], reverse=True)
    top_artists = top_artists[:10]

    # Genres inferred from each artist's classification
    genre_stats: dict[str, dict] = {}
    for a, st in artist_stats.items():
        genres = classify_artist_genres(a)
        if not genres:
            continue
        share = 1.0 / len(genres)
        for g in genres:
            gs = genre_stats.setdefault(g, {"plays": 0, "score": 0.0})
            gs["plays"] += round(st["plays"] * share)
            gs["score"] += st["score"] * share
    top_genres = [
        {"genre": g, "score": round(gs["score"], 3), "plays": gs["plays"]}
        for g, gs in genre_stats.items()
    ]
    top_genres.sort(key=lambda x: x["score"], reverse=True)
    top_genres = top_genres[:10]

    top_artist_share = (
        (top_artists[0]["plays"] / total_plays) if top_artists and total_plays > 0 else 0.0
    )
    persona = compute_persona(
        total_plays=total_plays,
        top_artist_share=top_artist_share,
        genre_count=len(top_genres),
        completion_rate=0.0,
        like_ratio=len(liked_ids) / max(total_plays, 1),
    )

    return {
        "total_plays": total_plays,
        "total_likes": len(liked_ids),
        "total_skips": 0,
        "avg_completion_rate": 0.0,
        "top_artists": top_artists,
        "top_genres": top_genres,
        "top_tracks": top_tracks,
        "persona": persona,
        "cold_start": total_plays < 10,
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
