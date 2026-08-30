"""Recommendation data models and schemas.

Defines the MongoDB document structures for:
- Behavioral signals (plays, skips, likes, searches, etc.)
- User taste profiles (aggregated preferences)
- Recommendation lists (cached personalized results)
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ── Signal types ──────────────────────────────────────────────

class SignalType(str, Enum):
    """All recorded behavioral signals."""
    PLAY_START      = "play_start"       # User started playing a track
    PLAY_COMPLETE   = "play_complete"    # Track played to >=80% completion
    PLAY_PROGRESS   = "play_progress"    # Periodic progress updates
    SKIP            = "skip"             # User skipped before 30%
    REPEAT          = "repeat"           # User replayed a track
    LIKE            = "like"             # User liked a track
    UNLIKE          = "unlike"           # User unliked a track
    ADD_TO_PLAYLIST = "add_to_playlist"  # Track added to a playlist
    REMOVE_PLAYLIST = "remove_playlist"  # Track removed from a playlist
    SEARCH          = "search"           # User searched for something
    QUEUE_ADD       = "queue_add"        # Track added to queue
    DOWNLOAD        = "download"         # Track downloaded
    SHARE           = "share"            # Track shared (future)


class Signal(BaseModel):
    """A single behavioral signal recorded for a user."""
    user_id:    str
    signal:     SignalType
    track_id:   str | None = None
    artist:     str | None = None
    album:      str | None = None
    genre:      str | None = None
    query:      str | None = None           # For search signals
    progress:   float | None = None         # 0.0-1.0 completion
    session_id: str | None = None           # Group signals by session
    context:    dict[str, Any] = Field(default_factory=dict)  # Extra metadata
    timestamp:  datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SignalRecord(BaseModel):
    """MongoDB document for a signal."""
    id:         str | None = Field(None, alias="_id")
    user_id:    str
    signal:     str
    track_id:   str | None = None
    artist:     str | None = None
    album:      str | None = None
    genre:      str | None = None
    query:      str | None = None
    progress:   float | None = None
    session_id: str | None = None
    context:    dict[str, Any] = Field(default_factory=dict)
    timestamp:  datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = {"populate_by_name": True}


# ── Taste profile ─────────────────────────────────────────────

class ArtistPreference(BaseModel):
    """Aggregated preference for a single artist."""
    artist:          str
    score:           float = 0.0    # Weighted affinity score
    play_count:      int = 0
    like_count:      int = 0
    skip_count:      int = 0
    completion_rate: float = 0.0    # Average completion %
    last_played:     datetime | None = None


class GenrePreference(BaseModel):
    """Aggregated preference for a genre."""
    genre:     str
    score:     float = 0.0
    play_count: int = 0


class TasteProfile(BaseModel):
    """A user's aggregated taste profile, rebuilt periodically."""
    user_id:              str
    top_artists:          list[ArtistPreference] = Field(default_factory=list)
    top_genres:           list[GenrePreference] = Field(default_factory=list)
    liked_track_ids:      list[str] = Field(default_factory=list)
    disliked_track_ids:   list[str] = Field(default_factory=list)
    total_plays:          int = 0
    total_likes:          int = 0
    total_skips:          int = 0
    avg_completion_rate:  float = 0.0
    active_hours:         dict[int, float] = Field(default_factory=dict)  # hour -> activity weight
    last_updated:         datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    version:              int = 1  # Schema version for migrations


# ── Cached recommendations ────────────────────────────────────

class RecommendationSection(BaseModel):
    """A named section of recommendations."""
    section_id: str           # e.g. "for_you", "more_like", "discover"
    title:      str
    track_ids:  list[str] = Field(default_factory=list)
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at:   datetime | None = None


class UserRecommendations(BaseModel):
    """Cached recommendation set for a user."""
    user_id:    str
    sections:   list[RecommendationSection] = Field(default_factory=list)
    version:    int = 1
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
