from pydantic import BaseModel


class PlaylistCreate(BaseModel):
    name: str
    description: str = ""


class Playlist(BaseModel):
    id: str
    name: str
    description: str
    track_ids: list[str] = []
    cover_url: str | None = None
    created_at: str
