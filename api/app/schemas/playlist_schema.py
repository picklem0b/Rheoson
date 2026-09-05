from __future__ import annotations
from pydantic import BaseModel, Field, field_validator
from typing import Optional
from app.schemas.track_schema import TrackSchema


class PlaylistSchema(BaseModel):
    id:          str = ""
    title:       str = ""
    description: str = ""
    artworkUrl:  str = ""
    tracks:      list[TrackSchema] = Field(default_factory=list)
    trackIds:    list[str] = Field(default_factory=list)  # stored IDs, always present
    trackCount:  int = 0
    isLocal:     bool = True
    spotifyId:   str = ""
    totalDuration: float = 0.0    # seconds, computed by server
    createdAt:   str = ""
    updatedAt:   str = ""

    @field_validator("trackCount", mode="before")
    @classmethod
    def _coerce_track_count(cls, v):
        """Accept string or int trackCount."""
        if isinstance(v, str):
            try:
                return int(v.replace("K", "000").split(".")[0])
            except (ValueError, TypeError):
                return 0
        return int(v) if v is not None else 0

    @field_validator("id", "title", "description", "artworkUrl", "spotifyId", "createdAt", "updatedAt", mode="before")
    @classmethod
    def _coerce_str(cls, v):
        """Stored playlists may hold None for string fields (create writes
        artworkUrl/spotifyId as None) — coerce to empty string instead of
        failing validation and 500-ing every playlist endpoint."""
        return "" if v is None else v

    @field_validator("totalDuration", mode="before")
    @classmethod
    def _coerce_duration(cls, v):
        return 0.0 if v is None else v


class CreatePlaylistSchema(BaseModel):
    title:       str
    description: str = ""


class UpdatePlaylistSchema(BaseModel):
    title:       str = ""
    description: str = ""
    artworkUrl:  str = ""
