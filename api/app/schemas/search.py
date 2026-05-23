from __future__ import annotations
from typing import Optional, Any
from pydantic import BaseModel, Field
from app.schemas.track import TrackSchema


# Temporary fallback schemas
# Replace later with real AlbumSchema / ArtistSchema files if needed
AlbumSchema = dict[str, Any]
ArtistSchema = dict[str, Any]


class PlaylistResultSchema(BaseModel):
    id: str
    title: str
    artworkUrl: Optional[str] = None
    trackCount: str | int = 0
    source: str = "youtube"  # "youtube" | "spotify"


class SearchResultsSchema(BaseModel):
    query: str

    tracks: list[TrackSchema] = Field(default_factory=list)
    albums: list[AlbumSchema] = Field(default_factory=list)
    artists: list[ArtistSchema] = Field(default_factory=list)
    playlists: list[PlaylistResultSchema] = Field(default_factory=list)


class ResolveResponseSchema(BaseModel):
    """Returned when the user pastes a Spotify or YouTube URL."""

    type: str  # "track" | "album" | "playlist" | "artist"

    tracks: list[TrackSchema] = Field(default_factory=list)
    albums: list[AlbumSchema] = Field(default_factory=list)
    artists: list[ArtistSchema] = Field(default_factory=list)
    playlists: list[PlaylistResultSchema] = Field(default_factory=list)


SearchResultsSchema.model_rebuild()
ResolveResponseSchema.model_rebuild()