"""Taste profiler — builds and maintains user taste profiles from signals.

The profiler analyzes behavioral signals to compute:
- Per-artist affinity scores (weighted by plays, likes, skips, completion)
- Per-genre preferences
- Time-of-day listening patterns
- Liked/disliked track lists
- Overall listening statistics

Profiles are rebuilt periodically (or on-demand) and cached in MongoDB
so the recommendation engine can read them efficiently.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import structlog
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.recommendation import (
    ArtistPreference,
    GenrePreference,
    TasteProfile,
)
from app.services.signal_service import (
    get_artist_stats,
    get_genre_stats,
    get_time_of_day_preferences,
    get_total_signals,
    get_play_history,
)

log = structlog.get_logger()

# ── Scoring weights ───────────────────────────────────────────
# These control how much each signal type contributes to artist affinity.

WEIGHTS = {
    "play_start":     1.0,    # Base play value
    "play_complete":  2.5,    # Completing a track is a strong positive signal
    "skip":          -1.5,    # Skipping is a strong negative signal
    "like":           4.0,    # Explicit like is very strong
    "unlike":        -3.0,    # Explicit unlike is very strong negative
    "repeat":         2.0,    # Replaying shows extra interest
    "add_to_playlist": 3.0,   # Adding to playlist is strong intent
    "queue_add":      1.5,    # Adding to queue is moderate interest
    "download":       3.5,    # Downloading is very strong positive
}

# Minimum signals needed before we consider a profile "warm"
COLD_START_THRESHOLD = 10

# Decay factor for time-weighted scoring (signals lose weight over time)
DECAY_HALF_LIFE_DAYS = 30


def _time_decay(timestamp: datetime, now: datetime | None = None) -> float:
    """Compute exponential decay weight based on signal age."""
    now = now or datetime.now(timezone.utc)
    age_days = (now - timestamp).total_seconds() / 86400
    return 2 ** (-age_days / DECAY_HALF_LIFE_DAYS)


async def build_taste_profile(
    db: AsyncIOMotorDatabase,
    user_id: str,
    *,
    force: bool = False,
) -> TasteProfile:
    """Build or refresh a user's taste profile from their signal history.

    This is the core profiling function. It:
    1. Checks if a recent profile exists (skip if fresh, unless force=True)
    2. Aggregates artist and genre stats from signals
    3. Computes weighted affinity scores
    4. Analyzes time-of-day patterns
    5. Persists the profile to MongoDB
    """
    now = datetime.now(timezone.utc)

    # Check existing profile freshness (skip if updated within last hour, unless forced)
    if not force:
        existing = await db.taste_profiles.find_one({"user_id": user_id})
        if existing:
            last_updated = existing.get("last_updated")
            if last_updated and (now - last_updated).total_seconds() < 3600:
                return TasteProfile(**{k: v for k, v in existing.items() if k != "_id"})

    total_signals = await get_total_signals(db, user_id)
    is_cold_start = total_signals < COLD_START_THRESHOLD

    # ── Artist preferences ────────────────────────────────────
    artist_stats = await get_artist_stats(db, user_id, days=90)
    top_artists = _compute_artist_preferences(artist_stats, now)

    # ── Genre preferences ─────────────────────────────────────
    genre_stats = await get_genre_stats(db, user_id, days=90)
    top_genres = _compute_genre_preferences(genre_stats)

    # ── Time-of-day patterns ──────────────────────────────────
    active_hours = await get_time_of_day_preferences(db, user_id, days=30)

    # ── Liked/disliked tracks ─────────────────────────────────
    liked_doc = await db.liked_tracks.find_one({"user_id": user_id})
    liked_track_ids = liked_doc.get("track_ids", []) if liked_doc else []

    # Compute disliked tracks (high skip count + low completion)
    disliked_track_ids = _compute_disliked_tracks(artist_stats)

    # ── Aggregate stats ───────────────────────────────────────
    signal_counts = {}
    # Reuse artist_stats to compute totals
    total_plays = sum(s.get("plays", 0) for s in artist_stats.values())
    total_likes = sum(s.get("likes", 0) for s in artist_stats.values())
    total_skips = sum(s.get("skips", 0) for s in artist_stats.values())

    completions = sum(s.get("completions", 0) for s in artist_stats.values())
    avg_completion = completions / max(total_plays, 1)

    profile = TasteProfile(
        user_id=user_id,
        top_artists=top_artists[:50],
        top_genres=top_genres[:20],
        liked_track_ids=liked_track_ids,
        disliked_track_ids=disliked_track_ids,
        total_plays=total_plays,
        total_likes=total_likes,
        total_skips=total_skips,
        avg_completion_rate=avg_completion,
        active_hours=active_hours,
        last_updated=now,
        version=1,
    )

    # Persist
    await db.taste_profiles.update_one(
        {"user_id": user_id},
        {"$set": profile.model_dump(mode="json")},
        upsert=True,
    )

    log.info("taste_profile.built", user_id=user_id, artists=len(top_artists),
             is_cold_start=is_cold_start)
    return profile


def _compute_artist_preferences(
    artist_stats: dict[str, dict],
    now: datetime,
) -> list[ArtistPreference]:
    """Compute weighted affinity scores for each artist."""
    scored = []
    for artist, stats in artist_stats.items():
        score = (
            stats["plays"] * WEIGHTS["play_start"]
            + stats["likes"] * WEIGHTS["like"]
            + stats["skips"] * WEIGHTS["skip"]
            + stats.get("completions", 0) * WEIGHTS["play_complete"]
        )
        # Normalize by total interactions to avoid bias toward heavy listeners
        total = stats["plays"] + stats["likes"] + stats["skips"]
        if total > 0:
            score = score / (total ** 0.5)  # Sublinear normalization

        scored.append(ArtistPreference(
            artist=artist,
            score=round(score, 3),
            play_count=stats["plays"],
            like_count=stats["likes"],
            skip_count=stats["skips"],
            completion_rate=round(stats.get("completion_rate", 0), 3),
        ))

    # Sort by score descending
    scored.sort(key=lambda x: x.score, reverse=True)
    return scored


def _compute_genre_preferences(
    genre_stats: dict[str, dict],
) -> list[GenrePreference]:
    """Compute weighted affinity scores for each genre."""
    scored = []
    for genre, stats in genre_stats.items():
        score = (
            stats["plays"] * WEIGHTS["play_start"]
            + stats["likes"] * WEIGHTS["like"]
            + stats["skips"] * WEIGHTS["skip"]
        )
        scored.append(GenrePreference(
            genre=genre,
            score=round(score, 3),
            play_count=stats["plays"],
        ))

    scored.sort(key=lambda x: x.score, reverse=True)
    return scored


def _compute_disliked_tracks(artist_stats: dict[str, dict]) -> list[str]:
    """Identify tracks that should be considered 'disliked' based on behavior."""
    # Currently we track this at artist level; track-level dislike
    # will be added when per-track stats are available
    return []


def is_cold_start(profile: TasteProfile | None) -> bool:
    """Check if the user doesn't have enough data for personalized recs."""
    if profile is None:
        return True
    return profile.total_plays < COLD_START_THRESHOLD
