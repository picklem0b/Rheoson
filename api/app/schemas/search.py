from pydantic import BaseModel
from app.schemas.track import Track


class SearchResult(BaseModel):
    tracks: list[Track]
    query: str
    total: int
