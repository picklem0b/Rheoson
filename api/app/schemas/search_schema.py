from __future__ import annotations
from typing import Optional, Any
from pydantic import BaseModel, Field
from app.schemas.track_schema import TrackSchema, ArtistSchema, AlbumSchema


class PlaylistResultSchema(BaseModel):
    id: str = ""
    title: str = ""
    artworkUrl: str = ""
    trackCount: int = 0
    source: str = "youtube"  # "youtube" | "spotify"

    @classmethod
    def model_validate(cls, obj, **kwargs):
        """Handle trackCount arriving as a string like '12K'."""
        if isinstance(obj, dict):
            raw = obj.get("trackCount", 0)
            if isinstance(raw, str):
                try:
                    obj = {**obj, "trackCount": int(raw.replace("K", "000").split(".")[0])}
                except (ValueError, TypeError):
                    obj = {**obj, "trackCount": 0}
        return super().model_validate(obj, **kwargs)


class SearchResultsSchema(BaseModel):
    query: str = ""

    tracks:    list[TrackSchema]          = Field(default_factory=list)
    albums:    list[AlbumSchema]          = Field(default_factory=list)
    artists:   list[ArtistSchema]         = Field(default_factory=list)
    playlists: list[PlaylistResultSchema] = Field(default_factory=list)


class ResolveResponseSchema(BaseModel):
    """Returned when the user pastes a Spotify or YouTube URL."""

    query: str = ""
    type:  str = ""

    tracks:    list[TrackSchema]          = Field(default_factory=list)
    albums:    list[AlbumSchema]          = Field(default_factory=list)
    artists:   list[ArtistSchema]         = Field(default_factory=list)
    playlists: list[PlaylistResultSchema] = Field(default_factory=list)
