"""Recommendation API routes.

Provides endpoints for:
- Personalized home sections
- Autoplay candidate tracks
- Discovery/random recommendations
- Taste profile info

Guest mode removed: every endpoint requires a verified Clerk session and
operates on THAT user's signals/history. Works WITHOUT MongoDB — falls back
to the user's local per-user history + library scan when the database is
unavailable.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query

from app.core.database import db_available, get_db
from app.core.deps import get_current_user
from app.services.taste_utils import compute_persona

router = APIRouter()


# ── Per-user local play history helpers ───────────────────────
# Reads come from app.services.local_history — the per-user JSON mirror every
# play/like write also lands in, so local mode reflects real activity.


async def _load_local_history(user_id: str) -> list[dict]:
    from app.services.local_history import read_history_local
    return await read_history_local(user_id)


async def _load_local_liked(user_id: str) -> list[str]:
    from app.services.local_history import read_liked_local
    return await read_liked_local(user_id)


async def _build_local_taste(user_id: str) -> dict:
    """Build a simple taste profile from the user's local history + likes."""
    history = await _load_local_history(user_id)
    liked = await _load_local_liked(user_id)

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
    user: dict = Depends(get_current_user),
):
    """Get personalized home page recommendations for the current user."""
    user_id = user["sub"]

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
    taste = await _build_local_taste(user_id)
    sections = []

    if taste["total_plays"] > 0:
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
    user: dict = Depends(get_current_user),
):
    """Get autoplay candidates when the current track ends."""
    user_id = user["sub"]

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
    user: dict = Depends(get_current_user),
):
    """Get discovery recommendations — diverse, exploratory tracks."""
    user_id = user["sub"]

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
    user: dict = Depends(get_current_user),
):
    """Get the current user's taste profile (Mongo signals or local mirror)."""
    user_id = user["sub"]

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

    # ── Local mode: derive everything from the user's mirror files ────
    return await _local_taste_profile(user_id)


# ── Taste helpers ─────────────────────────────────────────────

async def _top_tracks_mongo(db, user_id: str, limit: int = 5) -> list[dict]:
    """Most replayed tracks from the user's Mongo signals."""
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


async def _local_taste_profile(user_id: str) -> dict:
    """Taste profile derived from the user's local history/liked mirrors."""
    from app.routers.track_router import _hydrate_many
    from app.services.taste_utils import classify_artist_genres

    history = await _load_local_history(user_id)
    liked_ids = set(await _load_local_liked(user_id))
    total_plays = len(history)

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


# ── Daily Mixes ──────────────────────────────────────────────

@router.get("/mixes")
async def get_daily_mixes(
    limit: int = Query(15, ge=5, le=30),
    user: dict = Depends(get_current_user),
):
    """Spotify-style Daily Mixes — one infinite-feeling playlist per top genre.

    Genres come from the user's taste profile (Mongo signals or local mirror);
    each mix searches that genre and returns fully hydrated track dicts so the
    frontend can queue them immediately. Tracks are deduped across mixes and
    diverse per artist inside a mix. Hidden/disliked tracks are excluded.

    Cold-start users (no taste yet) get an empty list — the UI hides the row.
    """
    user_id = user["sub"]

    taste = None
    if db_available():
        try:
            db = get_db()
            from app.services.taste_profiler import build_taste_profile
            profile = await build_taste_profile(db, user_id)
            taste = {
                "top_genres": [{"genre": g.genre, "score": g.score} for g in profile.top_genres[:6]],
                "cold_start": profile.total_plays < 10,
            }
        except Exception:
            pass
    if taste is None:
        taste = await _local_taste_profile(user_id)
        taste["top_genres"] = taste.get("top_genres", [])[:6]

    genres = [g["genre"] for g in taste.get("top_genres", []) if g.get("genre")][:4]
    if taste.get("cold_start") or not genres:
        return {"mixes": [], "updated_at": datetime.now(timezone.utc).isoformat()}

    disliked = set()
    try:
        if db_available():
            from app.services.recommendation_engine import _load_disliked_ids
            disliked = await _load_disliked_ids(get_db(), user_id)
        else:
            from app.services.local_history import read_disliked_local
            disliked = set(await read_disliked_local(user_id))
    except Exception:
        pass

    from app.services.ytmusic_service import search as yt_search
    from app.services import track_identity

    mixes = []
    seen_global: set[str] = set()
    for idx, genre in enumerate(genres, start=1):
        try:
            results = await yt_search(f"{genre} hits", limit=limit * 2)
        except Exception as e:
            continue
        tracks = []
        seen_in_mix: set[str] = set()
        artist_counts: dict[str, int] = {}
        for t in results.get("tracks", []):
            tid = t.get("id", "")
            artist = t.get("artist", {}).get("name", "") if isinstance(t.get("artist"), dict) else str(t.get("artist", ""))
            if not tid or tid in seen_global or tid in disliked or tid in seen_in_mix:
                continue
            if artist_counts.get(artist, 0) >= 2:
                continue
            seen_global.add(tid)
            seen_in_mix.add(tid)
            artist_counts[artist] = artist_counts.get(artist, 0) + 1
            track_identity.mark_downloaded([t])  # isDownloaded + local stream when owned
            tracks.append(t)
            if len(tracks) >= limit:
                break
        if not tracks:
            continue
        art = tracks[0].get("artworkUrl", "")
        mixes.append({
            "id": f"daily-mix-{idx}",
            "title": f"Daily Mix {idx}",
            "subtitle": genre.title(),
            "artworkUrl": art,
            "tracks": tracks,
        })

    return {"mixes": mixes, "updated_at": datetime.now(timezone.utc).isoformat()}


# ── Radio ─────────────────────────────────────────────────────

@router.get("/radio")
async def get_radio(
    track_id: str = Query(..., description="Seed track ID"),
    limit: int = Query(20, ge=10, le=50),
    user: dict = Depends(get_current_user),
):
    """One-tap radio: an endless-feeling stream seeded by a single track.

    Builds candidates from similar-artist search, the artist's related
    artists (when resolvable), and trending — deduped, diverse, with the
    seed excluded and hidden tracks removed. Returns fully hydrated track
    dicts so the frontend queues them and keeps autoplaying on end.
    """
    user_id = user["sub"]

    disliked = set()
    if db_available():
        try:
            from app.services.recommendation_engine import _load_disliked_ids
            disliked = await _load_disliked_ids(get_db(), user_id)
        except Exception:
            pass
    else:
        try:
            from app.services.local_history import read_disliked_local
            disliked = set(await read_disliked_local(user_id))
        except Exception:
            pass

    from app.routers.track_router import _hydrate_track
    from app.services.ytmusic_service import search as yt_search, get_trending
    from app.services import track_identity

    seed = None
    try:
        seed = await _hydrate_track(track_id)
    except Exception:
        seed = None
    if not seed:
        return {"seed": None, "tracks": []}

    seed_artist = seed.get("artist", {}).get("name", "") if isinstance(seed.get("artist"), dict) else str(seed.get("artist", ""))

    pool: list[dict] = []
    seen: set[str] = set()

    def _add(t: dict) -> None:
        tid = t.get("id", "")
        if not tid or tid in seen or tid in disliked or tid == track_id:
            return
        seen.add(tid)
        pool.append(t)

    # 1. Similar-artist search
    if seed_artist:
        try:
            for q in (f"{seed_artist} similar", f"{seed_artist} mix", f"{seed_artist} live"):
                res = await yt_search(q, limit=limit)
                for t in res.get("tracks", []):
                    _add(t)
                    if len(pool) >= limit:
                        break
                if len(pool) >= limit:
                    break
        except Exception:
            pass

    # 2. Artist page related artists (best-effort)
    seed_artist_id = seed.get("artist", {}).get("id", "") if isinstance(seed.get("artist"), dict) else ""
    if seed_artist_id and len(pool) < limit:
        try:
            from app.services.ytmusic_service import get_artist_with_content
            artist_data = await get_artist_with_content(seed_artist_id)
            for rel in (artist_data.get("related") or [])[:3]:
                rel_name = rel.get("name", "")
                if not rel_name:
                    continue
                res = await yt_search(f"{rel_name} top tracks", limit=8)
                for t in res.get("tracks", []):
                    _add(t)
                    if len(pool) >= limit:
                        break
                if len(pool) >= limit:
                    break
        except Exception:
            pass

    # 3. Trending filler (keeps the radio alive)
    if len(pool) < limit:
        try:
            for t in await get_trending():
                _add(t)
                if len(pool) >= limit:
                    break
        except Exception:
            pass

    # Diversity: cap same-artist in the radio stream
    artist_counts: dict[str, int] = {}
    final: list[dict] = []
    for t in pool[:limit * 2]:
        artist = t.get("artist", {}).get("name", "") if isinstance(t.get("artist"), dict) else str(t.get("artist", ""))
        if artist_counts.get(artist, 0) >= 2:
            continue
        artist_counts[artist] = artist_counts.get(artist, 0) + 1
        track_identity.mark_downloaded([t])
        final.append(t)
        if len(final) >= limit:
            break

    return {
        "seed": {"id": seed.get("id"), "title": seed.get("title", ""), "artist": seed_artist},
        "tracks": final,
    }


@router.post("/refresh")
async def force_refresh(
    user: dict = Depends(get_current_user),
):
    """Force a full recommendation refresh for the current user."""
    user_id = user["sub"]

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
