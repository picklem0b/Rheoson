from __future__ import annotations
from fastapi import APIRouter, Query
from app.schemas.lyrics_schema import LyricsSchema
from app.services.lyrics_service import get_lyrics

router = APIRouter()


@router.get("/{track_id}", response_model=LyricsSchema)
async def fetch_lyrics(
    track_id: str,
    title:    str = Query(""),
    artist:   str = Query(""),
):
    return await get_lyrics(track_id, title=title, artist=artist)