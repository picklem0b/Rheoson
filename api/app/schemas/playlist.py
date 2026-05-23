from __future__ import annotations
from pydantic import BaseModel
from typing import Optional
from app.schemas.track import TrackSchema


class PlaylistSchema(BaseModel):
    id:          str
    title:       str
    description: Optional[str] = None
    artworkUrl:  Optional[str] = None
    tracks:      list[TrackSchema] = []
    trackCount:  int               = 0
    isLocal:     bool              = True
    spotifyId:   Optional[str]     = None
    createdAt:   str               = ""
    updatedAt:   str               = ""


class CreatePlaylistSchema(BaseModel):
    title:       str
    description: Optional[str] = None


class UpdatePlaylistSchema(BaseModel):
    title:       Optional[str] = None
    description: Optional[str] = None