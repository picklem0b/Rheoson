from pydantic import BaseModel


class Track(BaseModel):
    id: str
    title: str
    artist: str
    album: str
    duration: int
    path: str
    cover_url: str | None = None
    genre: str | None = None
    year: int | None = None
    liked: bool = False
    play_count: int = 0


class TrackList(BaseModel):
    tracks: list[Track]
    total: int
