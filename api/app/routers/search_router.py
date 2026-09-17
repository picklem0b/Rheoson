from __future__ import annotations
import re
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from app.core.deps import get_optional_user
from app.services.search_service import search, resolve_url
from app.services.ytmusic_service import CATEGORIES, category_meta
from app.services import weekly_cache
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
    _user:  dict | None = Depends(get_optional_user),
):
    q = _sanitize_query(q)
    if not q:
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    return await search(q, filter=filter)


@router.get("/categories")
async def list_categories(_user: dict | None = Depends(get_optional_user)) -> dict:
    """Category tiles for the browse grid, with the current cache week.

    Served from the backend so the grid, the weekly refresher and the smart
    search's category intent can never disagree about which categories exist.
    """
    return {
        "week":       weekly_cache.current_bucket(),
        "categories": CATEGORIES,
    }


@router.get("/categories/{slug}/top")
async def category_top(
    slug: str,
    limit: int = Query(5, ge=1, le=20),
    _user: dict | None = Depends(get_optional_user),
) -> dict:
    """The best songs in one category, refreshed weekly and cached on disk."""
    meta = category_meta(slug)
    if meta is None:
        raise HTTPException(status_code=404, detail=f"Unknown category: {slug}")

    async def produce():
        from app.services.ytmusic_service import get_category_top

        tracks = await get_category_top(slug, limit=limit)
        if not tracks:
            return None
        return {"week": weekly_cache.current_bucket(), "tracks": tracks}

    data = await weekly_cache.get_or_set(f"category:{slug}:{limit}", produce)
    if not data:
        return {"week": weekly_cache.current_bucket(), "category": meta, "tracks": []}
    return {**data, "category": meta}


class ResolveRequest(BaseModel):
    url: str


@router.post("/resolve", response_model=ResolveResponseSchema)
async def resolve_endpoint(
    body: ResolveRequest,
    _user: dict | None = Depends(get_optional_user),
):
    url = body.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="url is required")
    if len(url) > 2048:
        raise HTTPException(status_code=400, detail="URL too long")
    if not _URL_PATTERN.match(url):
        raise HTTPException(status_code=400, detail="Invalid URL format")

    # Only known media hosts may be fetched server-side (SSRF guard).
    from app.services.netguard import ensure_safe_media_url
    try:
        ensure_safe_media_url(url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return await resolve_url(url)