"""Recommendation engine — generates personalized recommendations.

Architecture:
1. CANDIDATE GENERATION — gather candidate tracks from multiple sources
2. SCORING — score each candidate against the user's taste profile
3. RANKING — sort by composite score
4. DIVERSITY — apply diversity rules to avoid repetition
5. SECTION BUILDING — organize into named sections for the UI

The engine is designed as an independent domain with clear interfaces
so scoring, candidate generation, or ML components can be swapped
without changing the rest of the application.
"""

from __future__ import annotations

import math
import random
from datetime import datetime, timezone
from typing import Any

import structlog
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.recommendation import (
    RecommendationSection,
    TasteProfile,
    UserRecommendations,
)
from app.services.taste_profiler import (
    build_taste_profile,
    is_cold_start,
    WEIGHTS,
)

log = structlog.get_logger()

# ── Configuration ─────────────────────────────────────────────

SECTION_CONFIG = {
    "for_you":       {"title": "Made for you",    "count": 20},
    "more_like":     {"title": "More like {artist}", "count": 10},
    "discover":      {"title": "Discover something new", "count": 15},
    "recent_favorites": {"title": "Recent favorites", "count": 10},
    "deep_cuts":     {"title": "Deep cuts you'll love", "count": 10},
}

# Diversity: max tracks per artist in a single section
MAX_PER_ARTIST = 3
# Max tracks per album in a single section
MAX_PER_ALBUM = 2
# Freshness bonus for recently released content (not used yet, placeholder)
FRESHNESS_BONUS = 0.1


async def generate_recommendations(
    db: AsyncIOMotorDatabase,
    user_id: str,
    *,
    force_refresh: bool = False,
) -> UserRecommendations:
    """Generate a full set of personalized recommendations for a user.

    This is the main entry point. It:
    1. Builds/refreshes the taste profile
    2. Gathers candidates from multiple sources
    3. Scores and ranks them
    4. Applies diversity rules
    5. Organizes into sections
    6. Caches the result
    """
    now = datetime.now(timezone.utc)

    # Check cached recommendations (refresh at most once per 30 minutes)
    if not force_refresh:
        cached = await _get_cached_recommendations(db, user_id, max_age_minutes=30)
        if cached:
            return cached

    # ── 1. Build taste profile ────────────────────────────────
    profile = await build_taste_profile(db, user_id, force=force_refresh)
    cold = is_cold_start(profile)

    # ── 2. Generate candidate pools ───────────────────────────
    if cold:
        candidates = await _cold_start_candidates(db)
    else:
        candidates = await _personalized_candidates(db, profile)

    # ── 3. Score candidates ───────────────────────────────────
    if not cold:
        scored = _score_candidates(candidates, profile)
    else:
        scored = candidates  # No scoring for cold start — use popularity

    # ── 4. Rank ───────────────────────────────────────────────
    scored.sort(key=lambda x: x["score"], reverse=True)

    # ── 5. Build sections ─────────────────────────────────────
    if cold:
        sections = _build_cold_start_sections(scored)
    else:
        sections = _build_personalized_sections(scored, profile)

    # ── 6. Cache ──────────────────────────────────────────────
    recs = UserRecommendations(
        user_id=user_id,
        sections=sections,
        updated_at=now,
    )
    await db.user_recommendations.update_one(
        {"user_id": user_id},
        {"$set": recs.model_dump(mode="json")},
        upsert=True,
    )

    log.info("recommendations.generated",
             user_id=user_id, sections=len(sections),
             cold_start=cold)
    return recs


# ── Candidate generation ──────────────────────────────────────

async def _cold_start_candidates(db: AsyncIOMotorDatabase) -> list[dict]:
    """Generate candidates for new users with no listening history.

    Strategy: Use trending/popular content as the baseline.
    """
    # Get trending tracks as the primary source
    candidates = []

    # Try to get trending from ytmusic
    try:
        from app.services.ytmusic_service import get_trending
        trending = await get_trending()
        for t in trending[:30]:
            candidates.append({
                "track_id": t.get("id", ""),
                "title": t.get("title", ""),
                "artist": t.get("artist", {}).get("name", "") if isinstance(t.get("artist"), dict) else str(t.get("artist", "")),
                "album": t.get("album", {}).get("name", "") if isinstance(t.get("album"), dict) else str(t.get("album", "")),
                "genre": None,
                "artwork_url": t.get("artworkUrl"),
                "score": t.get("popularity", 50) / 100.0,  # Normalize popularity to 0-1
                "source": "trending",
            })
    except Exception as e:
        log.warning("recommendations.cold_start.trending_failed", error=str(e))

    # Add some library tracks if available
    try:
        from app.routers.track_router import _build_index
        idx = await _build_index()
        library_tracks = list(idx.values())[:20]
        for t in library_tracks:
            candidates.append({
                "track_id": t.get("id", ""),
                "title": t.get("title", ""),
                "artist": t.get("artist", {}).get("name", "") if isinstance(t.get("artist"), dict) else str(t.get("artist", "")),
                "album": t.get("album", {}).get("name", "") if isinstance(t.get("album"), dict) else str(t.get("album", "")),
                "genre": None,
                "artwork_url": t.get("artworkUrl"),
                "score": 0.3,  # Moderate score for library tracks
                "source": "library",
            })
    except Exception:
        pass

    # Deduplicate by track_id
    seen = set()
    unique = []
    for c in candidates:
        if c["track_id"] and c["track_id"] not in seen:
            seen.add(c["track_id"])
            unique.append(c)

    return unique


async def _personalized_candidates(db: AsyncIOMotorDatabase, profile: TasteProfile) -> list[dict]:
    """Generate candidates based on the user's taste profile.

    Strategy: Combine multiple sources weighted by relevance.
    """
    candidates = []
    seen_ids = set()

    # ── Source 1: Similar to top liked artists ─────────────────
    for pref in profile.top_artists[:5]:
        try:
            from app.services.ytmusic_service import search as yt_search
            results = await yt_search(f"{pref.artist} similar", limit=10)
            for t in results:
                tid = t.get("id", "")
                if tid and tid not in seen_ids:
                    seen_ids.add(tid)
                    artist_name = t.get("artist", {}).get("name", "") if isinstance(t.get("artist"), dict) else str(t.get("artist", ""))
                    candidates.append({
                        "track_id": tid,
                        "title": t.get("title", ""),
                        "artist": artist_name,
                        "album": t.get("album", {}).get("name", "") if isinstance(t.get("album"), dict) else str(t.get("album", "")),
                        "genre": t.get("genre"),
                        "artwork_url": t.get("artworkUrl"),
                        "score": 0.0,  # Will be scored later
                        "source": "artist_similarity",
                        "related_artist": pref.artist,
                    })
        except Exception as e:
            log.warning("recommendations.artist_search.failed", artist=pref.artist, error=str(e))

    # ── Source 2: Trending (exploration) ───────────────────────
    try:
        from app.services.ytmusic_service import get_trending
        trending = await get_trending()
        for t in trending[:15]:
            tid = t.get("id", "")
            if tid and tid not in seen_ids:
                seen_ids.add(tid)
                artist_name = t.get("artist", {}).get("name", "") if isinstance(t.get("artist"), dict) else str(t.get("artist", ""))
                candidates.append({
                    "track_id": tid,
                    "title": t.get("title", ""),
                    "artist": artist_name,
                    "album": t.get("album", {}).get("name", "") if isinstance(t.get("album"), dict) else str(t.get("album", "")),
                    "genre": None,
                    "artwork_url": t.get("artworkUrl"),
                    "score": t.get("popularity", 50) / 200.0,  # Lower weight for trending
                    "source": "trending",
                })
    except Exception as e:
        log.warning("recommendations.trending.failed", error=str(e))

    # ── Source 3: Genre-based discovery ────────────────────────
    for pref in profile.top_genres[:3]:
        try:
            from app.services.ytmusic_service import search as yt_search
            results = await yt_search(f"{pref.genre} music", limit=8)
            for t in results:
                tid = t.get("id", "")
                if tid and tid not in seen_ids:
                    seen_ids.add(tid)
                    artist_name = t.get("artist", {}).get("name", "") if isinstance(t.get("artist"), dict) else str(t.get("artist", ""))
                    candidates.append({
                        "track_id": tid,
                        "title": t.get("title", ""),
                        "artist": artist_name,
                        "album": t.get("album", {}).get("name", "") if isinstance(t.get("album"), dict) else str(t.get("album", "")),
                        "genre": pref.genre,
                        "artwork_url": t.get("artworkUrl"),
                        "score": 0.0,
                        "source": "genre_discovery",
                        "related_genre": pref.genre,
                    })
        except Exception:
            pass

    # ── Source 4: Library tracks not recently played ───────────
    try:
        from app.routers.track_router import _build_index
        idx = await _build_index()
        liked_set = set(profile.liked_track_ids)
        for tid, t in idx.items():
            if tid not in seen_ids and tid not in liked_set:
                seen_ids.add(tid)
                artist_name = t.get("artist", {}).get("name", "") if isinstance(t.get("artist"), dict) else str(t.get("artist", ""))
                candidates.append({
                    "track_id": tid,
                    "title": t.get("title", ""),
                    "artist": artist_name,
                    "album": t.get("album", {}).get("name", "") if isinstance(t.get("album"), dict) else str(t.get("album", "")),
                    "genre": None,
                    "artwork_url": t.get("artworkUrl"),
                    "score": 0.1,  # Low base score — will be boosted if it matches taste
                    "source": "library",
                })
    except Exception:
        pass

    return candidates


# ── Scoring ───────────────────────────────────────────────────

def _score_candidates(candidates: list[dict], profile: TasteProfile) -> list[dict]:
    """Score each candidate against the user's taste profile.

    The composite score combines:
    - Artist affinity (how much the user likes this artist)
    - Genre affinity (how much the user likes this genre)
    - Liked track bonus (if the track is in the user's likes)
    - Source diversity bonus (slight boost for exploration sources)
    """
    artist_scores = {a.artist: a.score for a in profile.top_artists}
    genre_scores = {g.genre: g.score for g in profile.top_genres}
    liked_set = set(profile.liked_track_ids)

    # Normalize artist scores to 0-1 range
    max_artist = max((s for s in artist_scores.values()), default=1.0)
    if max_artist > 0:
        artist_scores = {k: v / max_artist for k, v in artist_scores.items()}

    max_genre = max((s for s in genre_scores.values()), default=1.0)
    if max_genre > 0:
        genre_scores = {k: v / max_genre for k, v in genre_scores.items()}

    for c in candidates:
        base_score = c.get("score", 0.0)

        # Artist affinity
        artist = c.get("artist", "")
        artist_affinity = artist_scores.get(artist, 0.0)

        # Genre affinity
        genre = c.get("genre")
        genre_affinity = genre_scores.get(genre, 0.0) if genre else 0.0

        # Liked bonus
        liked_bonus = 0.3 if c["track_id"] in liked_set else 0.0

        # Source diversity — small boost for exploration
        source_bonus = 0.05 if c.get("source") in ("genre_discovery", "trending") else 0.0

        # Composite score (weighted combination)
        c["score"] = round(
            base_score * 0.2           # Intrinsic popularity/source score
            + artist_affinity * 0.4    # Artist preference (strongest signal)
            + genre_affinity * 0.15    # Genre preference
            + liked_bonus              # Direct like match
            + source_bonus,            # Exploration bonus
            4,
        )

    return candidates


# ── Diversity ─────────────────────────────────────────────────

def _apply_diversity(tracks: list[dict], *, max_per_artist: int = MAX_PER_ARTIST, max_per_album: int = MAX_PER_ALBUM) -> list[dict]:
    """Apply diversity rules to avoid too many tracks from the same artist/album."""
    result = []
    artist_counts: dict[str, int] = {}
    album_counts: dict[str, int] = {}

    for t in tracks:
        artist = t.get("artist", "")
        album = t.get("album", "")

        ac = artist_counts.get(artist, 0)
        alc = album_counts.get(album, 0)

        if ac < max_per_artist and alc < max_per_album:
            result.append(t)
            artist_counts[artist] = ac + 1
            album_counts[album] = alc + 1

    return result


# ── Section building ──────────────────────────────────────────

def _build_cold_start_sections(scored: list[dict]) -> list[RecommendationSection]:
    """Build recommendation sections for cold-start users."""
    now = datetime.now(timezone.utc)
    sections = []

    # For You = trending + library mix
    sections.append(RecommendationSection(
        section_id="for_you",
        title="Popular right now",
        track_ids=[c["track_id"] for c in scored[:20]],
        generated_at=now,
    ))

    # Discover = diverse mix
    diverse = _apply_diversity(scored, max_per_artist=2)
    sections.append(RecommendationSection(
        section_id="discover",
        title="Discover something new",
        track_ids=[c["track_id"] for c in diverse[:15]],
        generated_at=now,
    ))

    return sections


def _build_personalized_sections(
    scored: list[dict],
    profile: TasteProfile,
) -> list[RecommendationSection]:
    """Build personalized recommendation sections."""
    now = datetime.now(timezone.utc)
    sections = []

    # ── Section 1: For You (top scored, diverse) ───────────────
    for_you = _apply_diversity(scored[:40])
    sections.append(RecommendationSection(
        section_id="for_you",
        title="Made for you",
        track_ids=[c["track_id"] for c in for_you[:SECTION_CONFIG["for_you"]["count"]]],
        generated_at=now,
    ))

    # ── Section 2: More Like Top Artist ────────────────────────
    if profile.top_artists:
        top_artist = profile.top_artist if hasattr(profile, "top_artist") else profile.top_artists[0].artist
        artist_tracks = [c for c in scored if c.get("artist") == top_artist or c.get("related_artist") == top_artist]
        if artist_tracks:
            sections.append(RecommendationSection(
                section_id="more_like",
                title=f"More like {top_artist}",
                track_ids=[c["track_id"] for c in _apply_diversity(artist_tracks)[:SECTION_CONFIG["more_like"]["count"]]],
                generated_at=now,
            ))

    # ── Section 3: Discover (low-overlap exploration) ──────────
    discovery = [c for c in scored if c.get("source") in ("genre_discovery", "trending")]
    diverse_discovery = _apply_diversity(discovery, max_per_artist=1)
    sections.append(RecommendationSection(
        section_id="discover",
        title="Discover something new",
        track_ids=[c["track_id"] for c in diverse_discovery[:SECTION_CONFIG["discover"]["count"]]],
        generated_at=now,
    ))

    # ── Section 4: Deep Cuts (library tracks user hasn't explored) ──
    deep_cuts = [c for c in scored if c.get("source") == "library"]
    sections.append(RecommendationSection(
        section_id="deep_cuts",
        title="Deep cuts you'll love",
        track_ids=[c["track_id"] for c in deep_cuts[:SECTION_CONFIG["deep_cuts"]["count"]]],
        generated_at=now,
    ))

    # ── Section 5: Recent Favorites (liked tracks) ─────────────
    if profile.liked_track_ids:
        sections.append(RecommendationSection(
            section_id="recent_favorites",
            title="Your favorites",
            track_ids=profile.liked_track_ids[:SECTION_CONFIG["recent_favorites"]["count"]],
            generated_at=now,
        ))

    return sections


# ── Cache management ──────────────────────────────────────────

async def _get_cached_recommendations(
    db: AsyncIOMotorDatabase,
    user_id: str,
    *,
    max_age_minutes: int = 30,
) -> UserRecommendations | None:
    """Retrieve cached recommendations if they're fresh enough."""
    doc = await db.user_recommendations.find_one({"user_id": user_id})
    if not doc:
        return None

    updated_at = doc.get("updated_at")
    if not updated_at:
        return None

    age = (datetime.now(timezone.utc) - updated_at).total_seconds() / 60
    if age > max_age_minutes:
        return None

    try:
        return UserRecommendations(**{k: v for k, v in doc.items() if k != "_id"})
    except Exception:
        return None


# ── Autoplay ──────────────────────────────────────────────────

async def get_autoplay_candidates(
    db: AsyncIOMotorDatabase,
    user_id: str,
    current_track_id: str,
    *,
    limit: int = 5,
) -> list[dict]:
    """Get autoplay candidates when the current track ends.

    Returns tracks similar to the current one, weighted by user taste.
    """
    profile = await build_taste_profile(db, user_id)
    cold = is_cold_start(profile)

    # Get current track info
    try:
        from app.routers.track_router import _hydrate_track
        current = await _hydrate_track(current_track_id)
    except Exception:
        current = None

    if not current:
        return []

    artist = current.get("artist", {}).get("name", "") if isinstance(current.get("artist"), dict) else str(current.get("artist", ""))

    # Search for similar tracks
    candidates = []
    try:
        from app.services.ytmusic_service import search as yt_search
        results = await yt_search(f"{artist} similar", limit=limit * 3)
        for t in results:
            tid = t.get("id", "")
            if tid and tid != current_track_id:
                t_artist = t.get("artist", {}).get("name", "") if isinstance(t.get("artist"), dict) else str(t.get("artist", ""))
                score = 0.5
                if not cold:
                    # Boost if matches user taste
                    artist_pref = next((a for a in profile.top_artists if a.artist == t_artist), None)
                    if artist_pref:
                        score += artist_pref.score * 0.3
                candidates.append({
                    "track_id": tid,
                    "title": t.get("title", ""),
                    "artist": t_artist,
                    "score": score,
                })
    except Exception:
        pass

    candidates.sort(key=lambda x: x["score"], reverse=True)
    return candidates[:limit]
