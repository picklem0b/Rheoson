"""Artist follow endpoints.

Splits cleanly from the artist *detail* route that lives in ``main.py``:
these paths all carry an extra segment or a reserved name, so they never
collide with ``GET /api/artists/{artist_id}`` (and this router is included
before it anyway, which is what makes the reserved ``/following`` path
resolve correctly).

Follows are stored per user via ``artist_follows`` (JSON next to the library,
so it works without MongoDB). The newest release for a followed artist is
remembered on the follow record, which is what makes "their latest song"
notifications — and the auto-curated top pick for that artist — possible
without re-fetching the whole artist page every render.
"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, Body, Depends, HTTPException

from app.core.deps import get_current_user
from app.services import artist_follows

log = structlog.get_logger()
router = APIRouter()


def _newest_release(artist: dict) -> dict | None:
    """Pick the artist's newest album or single.

    YouTube Music gives albums and singles as separate sections and does not
    always populate a release year, so ordering falls back to the section
    order (which upstream returns newest-first) when years are missing.
    """
    candidates: list[dict] = []
    for index, item in enumerate(artist.get("albums") or []):
        candidates.append({**item, "_section": "album", "_order": index})
    for index, item in enumerate(artist.get("singles") or []):
        candidates.append({**item, "_section": "single", "_order": index})

    def year_of(item: dict) -> int:
        year = item.get("releaseYear") or item.get("year") or 0
        try:
            return int(year)
        except (TypeError, ValueError):
            return 0

    dated = [c for c in candidates if year_of(c) > 0]
    pool = dated or candidates
    if not pool:
        return None

    # Newest year first; within a year, keep upstream's newest-first order.
    best = sorted(pool, key=lambda c: (-year_of(c), c["_order"]))[0]
    return {
        "id":         best.get("id") or "",
        "title":      best.get("title") or "",
        "artworkUrl": best.get("artworkUrl") or "",
        "releaseYear": year_of(best),
        "type":       best.get("_section") or "album",
    }


def _follow_payload(artist_id: str, artist: dict) -> dict:
    """Flatten an artist payload into the fields a follow record stores."""
    return {
        "artist_id": artist_id,
        "name": artist.get("name") or "",
        "image_url": artist.get("imageUrl") or "",
        "monthly_listeners": int(artist.get("monthlyListeners") or 0),
        "latest_release": _newest_release(artist),
    }


@router.get("/following")
async def list_following(user: dict = Depends(get_current_user)) -> dict:
    """Every artist the caller follows, newest follow first."""
    follows = await artist_follows.list_follows(user["sub"])
    return {"artists": follows, "count": len(follows)}


@router.get("/{artist_id}/status")
async def follow_status(
    artist_id: str,
    user: dict = Depends(get_current_user),
) -> dict:
    """Follow state + any unseen release for one artist."""
    follows = await artist_follows.list_follows(user["sub"])
    record = next((f for f in follows if f.get("id") == artist_id), None)
    if record is None:
        return {"isFollowing": False, "latestRelease": None}

    release = record.get("latestRelease")
    # A release recorded after the follow itself is "new" to this user.
    seen_at = record.get("releaseSeenAt")
    is_new = bool(
        release
        and release.get("id")
        and (seen_at is None or release.get("id") != seen_at)
    )
    return {"isFollowing": True, "latestRelease": release, "isNewRelease": is_new}


@router.post("/{artist_id}/follow")
async def follow_artist(
    artist_id: str,
    body: dict = Body(default_factory=dict),
    user: dict = Depends(get_current_user),
) -> dict:
    """Follow an artist, caching their newest release for later notifications."""
    # Only accept real artist ids — "unknown" and "local" are synthetic ids
    # the library aggregate uses and must never be persisted as follows.
    if not artist_id or artist_id in {"unknown", "local"}:
        raise HTTPException(status_code=400, detail="Invalid artist id")

    name = str(body.get("name") or "")
    image_url = str(body.get("imageUrl") or "")
    monthly = int(body.get("monthlyListeners") or 0)

    # Best-effort enrichment: fetch the artist page to capture the newest
    # release and fill in metadata the client may not have sent.
    latest = None
    try:
        from app.services.ytmusic_service import get_artist_with_content

        artist = await get_artist_with_content(artist_id)
        if artist.get("name"):
            payload = _follow_payload(artist_id, artist)
            name = name or payload["name"]
            image_url = image_url or payload["image_url"]
            monthly = monthly or payload["monthly_listeners"]
            latest = payload["latest_release"]
    except Exception as e:
        log.info("artist.follow.enrich_failed", artist_id=artist_id, error=str(e))

    record = await artist_follows.follow(
        user["sub"],
        artist_id,
        name=name,
        image_url=image_url,
        monthly_listeners=monthly,
        latest_release=latest,
    )
    return {"isFollowing": True, "artist": record}


@router.delete("/{artist_id}/follow")
async def unfollow_artist(
    artist_id: str,
    user: dict = Depends(get_current_user),
) -> dict:
    await artist_follows.unfollow(user["sub"], artist_id)
    return {"isFollowing": False}


@router.post("/{artist_id}/seen")
async def mark_release_seen(
    artist_id: str,
    user: dict = Depends(get_current_user),
) -> dict:
    """Mark the artist's latest release as seen so it stops being 'new'."""
    follows = await artist_follows.list_follows(user["sub"])
    record = next((f for f in follows if f.get("id") == artist_id), None)
    if record is None:
        return {"ok": False}

    release = record.get("latestRelease") or {}
    marked = await artist_follows.mark_release_seen(
        user["sub"], artist_id, str(release.get("id") or "")
    )
    return {"ok": marked}
