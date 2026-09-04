from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Optional, Literal


AudioFormat  = Literal["mp3", "flac", "opus", "m4a", "wav"]
AudioQuality = Literal["128", "192", "256", "320", "best"]
DownloadStatus = Literal[
    "queued", "searching", "downloading",
    "converting", "tagging", "done", "error", "cancelled"
]


FileNaming = Literal["artist-title", "title-artist", "id"]


class DownloadRequestSchema(BaseModel):
    # One of these must be set
    trackId:  Optional[str] = None   # ytmusic video ID
    url:      Optional[str] = None   # YouTube or Spotify URL

    format:       AudioFormat  = "mp3"
    quality:      AudioQuality = "320"
    embedArtwork: bool         = True
    embedLyrics:  bool         = True
    embedMetadata: bool        = True

    # yt-dlp behaviour
    retries:     int  = Field(3, ge=0, le=20)  # 0 = no retries
    speedLimit:  int  = Field(0, ge=0)         # KB/s, 0 = unlimited
    concurrency: int  = Field(3, ge=1, le=8)   # max simultaneous downloads

    # Output location / file naming
    fileNaming: FileNaming = "artist-title"
    customPath: Optional[str] = Field(None, max_length=1024)  # overrides MUSIC_DIR


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
    # Options recorded at enqueue time so a retry reproduces them exactly
    embedMetadata: bool        = True
    fileNaming:    FileNaming  = "artist-title"
    customPath:    Optional[str] = None
    retries:       int         = 3
    speedLimit:    int         = 0
    concurrency:   int         = 3


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
