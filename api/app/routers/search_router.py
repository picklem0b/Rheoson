from __future__ import annotations
import re
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from app.services.search_service import search, resolve_url
from app.services.ytmusic_service import get_suggestions
from app.schemas.search_schema import SearchResultsSchema, ResolveResponseSchema

router = APIRouter()

# Maximum query length to prevent abuse
_MAX_QUERY_LEN = 200
_URL_PATTERN = re.compile(r'^https?://', re.IGNORECASE)


def _sanitize_query(q: str) -> str:
    """Strip control characters and limit length."""
    q = q.strip()
    # Remove control characters (but keep unicode letters, emojis, etc.)
    q = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', q)
    return q[:_MAX_QUERY_LEN]


@router.get("", response_model=SearchResultsSchema)
async def search_endpoint(
    q:      str        = Query(..., min_length=1),
    # 'songs' is accepted as an alias for 'tracks' — the service layer
    # already branches on it, so the router must not reject it.
    filter: str | None = Query(None, pattern="^(tracks|songs|albums|artists|playlists)$"),
):
    q = _sanitize_query(q)
    if not q:
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    return await search(q, filter=filter)


@router.get("/suggest")
async def suggest_endpoint(q: str = Query(..., min_length=1)) -> list[str]:
    """
    Instant autocomplete — returns in ~80ms.
    No debounce needed — call on every keystroke.
    """
    q = _sanitize_query(q)
    if len(q) < 2:
        return []
    return await get_suggestions(q)


class ResolveRequest(BaseModel):
    url: str


@router.post("/resolve", response_model=ResolveResponseSchema)
async def resolve_endpoint(body: ResolveRequest):
    url = body.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="url is required")
    if len(url) > 2048:
        raise HTTPException(status_code=400, detail="URL too long")
    if not _URL_PATTERN.match(url):
        raise HTTPException(status_code=400, detail="Invalid URL format")
    return await resolve_url(url)