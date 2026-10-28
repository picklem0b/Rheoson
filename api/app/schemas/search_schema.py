from __future__ import annotations
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


class UnmatchedTrackSchema(BaseModel):
    """One song a Spotify link named that YouTube Music could not be trusted
    with — named, not dropped, so the import can be honest about the gap."""

    title:      str = ""
    artist:     str = ""
    spotifyId:  str = ""
    reason:     str = ""
    score:      float = 0.0


class ResolveResponseSchema(BaseModel):
    """Returned when the user pastes a Spotify or YouTube URL."""

    query: str = ""
    type:  str = ""

    tracks:    list[TrackSchema]          = Field(default_factory=list)
    albums:    list[AlbumSchema]          = Field(default_factory=list)
    artists:   list[ArtistSchema]         = Field(default_factory=list)
    playlists: list[PlaylistResultSchema] = Field(default_factory=list)

    # Totals for the collection behind the link. `total` is what the link
    # contains (including items that can never play, like local files), so the
    # UI can say "184 of 205" instead of pretending it found everything.
    total:     int = 0
    matched:   int = 0
    skipped:   int = 0
    unmatched: list[UnmatchedTrackSchema] = Field(default_factory=list)
