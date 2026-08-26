from __future__ import annotations
from fastapi import APIRouter, Query, HTTPException
from app.services.search_service import search, resolve_url
from app.services.ytmusic_service import get_suggestions
from app.schemas.search_schema import SearchResultsSchema, ResolveResponseSchema

router = APIRouter()


@router.get("", response_model=SearchResultsSchema)
async def search_endpoint(
    q:      str        = Query(..., min_length=1),
    filter: str | None = Query(None, regex="^(tracks|albums|artists|playlists)$"),
):
    return await search(q, filter=filter)


@router.get("/suggest")
async def suggest_endpoint(q: str = Query(..., min_length=1)) -> list[str]:
    """
    Instant autocomplete — returns in ~80ms.
    No debounce needed — call on every keystroke.
    """
    if len(q.strip()) < 2:
        return []
    return await get_suggestions(q)


@router.post("/resolve", response_model=ResolveResponseSchema)
async def resolve_endpoint(body: dict):
    url = body.get("url", "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="url is required")
    return await resolve_url(url)