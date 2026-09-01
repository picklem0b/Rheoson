from __future__ import annotations
from pydantic import BaseModel, Field, field_validator
from typing import Optional


class ArtistSchema(BaseModel):
    id:        str = ""
    name:      str = "Unknown Artist"
    imageUrl:  str = ""
    genres:    list[str] = Field(default_factory=list)
    followers: int = 0
    monthlyListeners: int = 0
    description: str = ""
    subscribers: str = ""
    topTracks: list = Field(default_factory=list)   # list[TrackSchema], lazy ref
    albums:    list = Field(default_factory=list)    # list[AlbumSchema], lazy ref

    model_config = {"from_attributes": True}


class AlbumSchema(BaseModel):
    id:          str = ""
    title:       str = ""
    artist:      ArtistSchema = Field(default_factory=ArtistSchema)
    artworkUrl:  str = ""
    releaseYear: int = 0
    year:        int = 0
    trackCount:  int = 0
    tracks:      list = Field(default_factory=list)  # list[TrackSchema], lazy ref

    model_config = {"from_attributes": True}


class TrackSchema(BaseModel):
    id:           str = ""
    title:        str = ""
    artist:       ArtistSchema = Field(default_factory=ArtistSchema)
    album:        AlbumSchema = Field(default_factory=AlbumSchema)
    artworkUrl:   str = ""
    duration:     float = 0.0       # seconds
    streamUrl:    str = ""
    filePath:     str = ""
    isDownloaded: bool = False
    isLiked:      bool = False
    youtubeId:    str = ""
    spotifyId:    str = ""
    addedAt:      str = ""
    trackNumber:  int = 0
    playCount:    int = 0

    model_config = {"from_attributes": True}

    @field_validator("duration", mode="before")
    @classmethod
    def _coerce_duration(cls, v):
        """Accept duration as string '3:45' and convert to seconds."""
        if isinstance(v, str):
            parts = v.split(":")
            try:
                if len(parts) == 2:
                    return int(parts[0]) * 60 + int(parts[1])
                if len(parts) == 3:
                    return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
            except (ValueError, TypeError):
                pass
            return 0.0
        return float(v) if v is not None else 0.0

    @field_validator("isDownloaded", "isLiked", mode="before")
    @classmethod
    def _coerce_bool(cls, v):
        """Accept truthy/falsy values for boolean fields."""
        if v is None:
            return False
        return bool(v)
