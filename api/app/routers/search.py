from fastapi import APIRouter
from app.schemas.search import SearchResult
from app.services.search_service import search_library

router = APIRouter()


@router.get("/", response_model=SearchResult)
async def search(q: str):
    tracks = search_library(q)
    return SearchResult(tracks=tracks, query=q, total=len(tracks))
