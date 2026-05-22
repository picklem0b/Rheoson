from fastapi import APIRouter, Query
from app.services.lyrics_service import fetch_lyrics

router = APIRouter()


@router.get("/")
async def get_lyrics(
    title: str = Query(...),
    artist: str = Query(...),
    album: str = Query(""),
    duration: int = Query(0),
):
    result = await fetch_lyrics(title, artist, album, duration)
    if result is None:
        return {"plain": None, "synced": None}
    return result
