from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Optional


class ArtistSchema(BaseModel):
    id:        str
    name:      str
    imageUrl:  Optional[str] = None
    genres:    list[str]     = []

    model_config = {"from_attributes": True}


class AlbumSchema(BaseModel):
    id:          str
    title:       str
    artist:      ArtistSchema
    artworkUrl:  str          = ""
    releaseYear: int          = 0
    trackCount:  int          = 0

    model_config = {"from_attributes": True}


class TrackSchema(BaseModel):
    id:           str
    title:        str
    artist:       ArtistSchema
    album:        AlbumSchema
    artworkUrl:   str            = ""
    duration:     float          = 0.0      # seconds
    streamUrl:    Optional[str]  = None     # /api/stream/{id}/audio
    filePath:     Optional[str]  = None     # local path if downloaded
    isDownloaded: bool           = False
    isLiked:      bool           = False
    youtubeId:    Optional[str]  = None
    spotifyId:    Optional[str]  = None
    addedAt:      Optional[str]  = None

    model_config = {"from_attributes": True}