from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Optional, Literal

from app.schemas.search_schema import UnmatchedTrackSchema


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


class SpotifyImportRequest(DownloadRequestSchema):
    """A Spotify collection link, plus how many of it to queue.

    Inherits every audio option from a single download so the import produces
    the same files a one-track download would. `limit` exists because a 2 000
    track playlist is a deliberate act, not something a paste should start.
    """

    url: str
    limit: int = Field(200, ge=1, le=500)
    skipExisting: bool = True


class SpotifyImportSchema(BaseModel):
    """Poll state for one import: what the link held, what was matched, what
    is queued, and the songs that could not be trusted to a match."""

    id: str
    status: Literal["resolving", "queueing", "done", "error"] = "resolving"
    url: str = ""
    kind: str = ""
    title: str = ""
    artworkUrl: str = ""
    total: int = 0
    matched: int = 0
    queued: int = 0
    skipped: int = 0
    skippedExisting: int = 0
    unmatched: list[UnmatchedTrackSchema] = Field(default_factory=list)
    error: Optional[str] = None
    createdAt: str = ""
    finishedAt: Optional[str] = None


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
    # Live transfer telemetry, parsed from yt-dlp's progress line. All three
    # are absent rather than zero when the server cannot report them, so the
    # UI can distinguish "no data yet" from "stopped moving".
    totalBytes: Optional[int] = None
    speedBps:   Optional[int] = None
    etaSeconds: Optional[int] = None
    # Resume support: resumable=True when partial transfer data is staged
    # for this job; stagedBytes is how much a resumed attempt can skip.
    resumable:   Optional[bool] = None
    stagedBytes: Optional[int] = None
    # Options recorded at enqueue time so a retry reproduces them exactly
    embedMetadata: bool        = True
    fileNaming:    FileNaming  = "artist-title"
    customPath:    Optional[str] = None
    retries:       int         = 3
    speedLimit:    int         = 0
    concurrency:   int         = 3
