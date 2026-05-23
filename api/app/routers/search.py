from __future__ import annotations
from fastapi import APIRouter, Query
from app.services.search_service import search, resolve_url
from app.schemas.search import SearchResultsSchema, ResolveResponseSchema

router = APIRouter()


@router.get("", response_model=SearchResultsSchema)
async def search_endpoint(
    q:      str         = Query(..., min_length=1),
    filter: str | None  = Query(None, regex="^(tracks|albums|artists|playlists)$"),
):
    return await search(q, filter=filter)


@router.post("/resolve", response_model=ResolveResponseSchema)
async def resolve_endpoint(body: dict):
    url = body.get("url", "").strip()
    if not url:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="url is required")
    return await resolve_url(url)