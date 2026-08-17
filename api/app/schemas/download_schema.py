from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Optional, Literal


AudioFormat  = Literal["mp3", "flac", "opus", "m4a", "wav"]
AudioQuality = Literal["128", "192", "256", "320", "best"]
DownloadStatus = Literal[
    "queued", "searching", "downloading",
    "converting", "tagging", "done", "error"
]


class DownloadRequestSchema(BaseModel):
    # One of these must be set
    trackId:  Optional[str] = None   # ytmusic video ID
    url:      Optional[str] = None   # YouTube or Spotify URL

    format:       AudioFormat  = "mp3"
    quality:      AudioQuality = "320"
    embedArtwork: bool         = True
    embedLyrics:  bool         = True


class DownloadJobSchema(BaseModel):
    id:         str
    trackId:    str           = ""
    title:      str           = ""
    artist:     str           = ""
    artworkUrl: str           = ""
    status:     DownloadStatus = "queued"
    progress:   float         = 0.0      # 0–100
    format:     AudioFormat   = "mp3"
    quality:    AudioQuality  = "320"
    error:      Optional[str] = None
    filePath:   Optional[str] = None
    createdAt:  str           = ""