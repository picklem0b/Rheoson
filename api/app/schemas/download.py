from enum import StrEnum
from pydantic import BaseModel


class AudioFormat(StrEnum):
    MP3  = "mp3"
    FLAC = "flac"
    M4A  = "m4a"
    OGG  = "ogg"
    OPUS = "opus"


class DownloadRequest(BaseModel):
    # either a direct YouTube/SoundCloud URL or a plain search query
    url:     str
    format:  AudioFormat = AudioFormat.MP3
    # optional — if set, songs are saved into music_dir/<playlist_name>/
    playlist_name: str | None = None


class DownloadJob(BaseModel):
    job_id:   str
    url:      str
    format:   str
    status:   str           # queued | downloading | complete | failed
    progress: float  = 0.0  # 0.0 – 1.0
    title:    str | None = None
    path:     str | None = None
    error:    str | None = None