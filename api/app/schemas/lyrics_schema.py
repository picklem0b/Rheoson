from __future__ import annotations
from pydantic import BaseModel


class LyricsLineSchema(BaseModel):
    time: float   # milliseconds
    text: str


class LyricsSchema(BaseModel):
    trackId: str
    synced:  bool                  = False
    lines:   list[LyricsLineSchema]= []
    source:  str                   = ""