from __future__ import annotations
from pydantic import BaseModel
from app.schemas.track import TrackSchema, AlbumSchema, ArtistSchema


class PlaylistResultSchema(BaseModel):
    id:         str
    title:      str
    artworkUrl: str = ""
    trackCount: int = 0
    source:     str = "youtube"    # "youtube" | "spotify"


class SearchResultsSchema(BaseModel):
    query:     str
    tracks:    list[TrackSchema]         = []
    albums:    list[AlbumSchema]         = []
    artists:   list[ArtistSchema]        = []
    playlists: list[PlaylistResultSchema]= []


class ResolveResponseSchema(BaseModel):
    """Returned when the user pastes a Spotify or YouTube URL."""
    type:      str                              # "track" | "album" | "playlist" | "artist"
    tracks:    list[TrackSchema]         = []
    albums:    list[AlbumSchema]         = []
    artists:   list[ArtistSchema]        = []
    playlists: list[PlaylistResultSchema]= []