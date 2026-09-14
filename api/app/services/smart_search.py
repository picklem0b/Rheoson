"""Context-aware ("smart") search.

Plain search answers *what you typed*. This layer answers *what you meant*,
taking into account what the app is currently playing — which is what makes
phrases like "more like this", "something similar but faster" or "play the
album version" work from the search bar while a track is playing.

Design: intent detection is rule-based and deterministic. No model calls, no
latency surprises, and every branch is testable. The detected intent becomes
the response's `intent` field so the UI can label the answer ("Playing
something like what's on now") instead of pretending it was a text match.

Every intent resolves to real, playable tracks; when a branch cannot resolve
anything it degrades to a plain search rather than returning nothing.
"""

from __future__ import annotations

import re
import structlog

log = structlog.get_logger()

# ── Intent patterns ───────────────────────────────────────────
# Ordered: the first match wins, so put the specific phrasings first.

_SIMILAR = re.compile(
    r"\b(more like|similar to|like this|like what'?s? playing|sounds like|"
    r"same vibe|next song like|something like|recommend)\b",
    re.IGNORECASE,
)
_LIKED = re.compile(r"\b(my\s+)?(liked|favourite|favorite|saved)\b", re.IGNORECASE)
_TOP = re.compile(
    r"\b(my\s+)?(top|most played|best|heavy rotation|on repeat)\b", re.IGNORECASE
)
_TRENDING = re.compile(
    r"\b(trending|charts?|popular now|what'?s hot|hot right now|top charts)\b",
    re.IGNORECASE,
)
_DOWNLOAD = re.compile(r"\b(download|save offline|get offline)\b", re.IGNORECASE)
_ARTIST = re.compile(r"\b(songs? by|tracks? by|music by|more from)\b", re.IGNORECASE)
_PLAY = re.compile(r"^\s*(play|put on|start)\s+", re.IGNORECASE)
_SHUFFLE = re.compile(r"\bshuffle\b", re.IGNORECASE)

# Filler words stripped when extracting the subject of a phrase.
_FILLER = re.compile(
    r"^(please|can you|could you|i want to|i wanna|i want|make it|"
    r"give me|show me|find me|some|a|an|the|me)\s+",
    re.IGNORECASE,
)


def _clean_subject(query: str) -> str:
    """Strip conversational filler and punctuation from a phrase subject."""
    subject = query.strip().strip("?.!,")
    changed = True
    while changed:
        new = _FILLER.sub("", subject)
        changed = new != subject
        subject = new
    return subject.strip()


def _match_category(query: str) -> str | None:
    """Return the category slug whose label appears in the query."""
    from app.services.ytmusic_service import CATEGORIES

    lowered = query.lower()
    for category in CATEGORIES:
        label = category["label"].lower()
        slug = category["slug"]
        if re.search(rf"\b{re.escape(label)}\b", lowered) or slug in lowered:
            return slug
    return None


def detect_intent(query: str, context: dict | None = None) -> str:
    """Classify a query into one intent id."""
    context = context or {}
    q = query.strip()

    if _SIMILAR.search(q):
        return "similar"
    if _DOWNLOAD.search(q):
        return "download"
    if _TRENDING.search(q) and len(_clean_subject(q)) <= 24:
        return "trending"
    if _LIKED.search(q) and len(_clean_subject(q)) <= 24:
        return "liked"
    if _TOP.search(q) and len(_clean_subject(q)) <= 30:
        return "top"
    if _match_category(q) and len(_clean_subject(q)) <= 24:
        return "category"
    if _ARTIST.search(q):
        return "artist"
    if _SHUFFLE.search(q) and len(_clean_subject(q)) <= 40:
        return "shuffle"
    if _PLAY.search(q):
        return "play"
    if context.get("track_id") and len(_clean_subject(q)) <= 12:
        # Very short queries while a track plays are almost always a nudge
        # ("again", "next") rather than a search for a 5-letter title.
        if re.fullmatch(r"(this|that|it|again|more|next|another)", q.strip(), re.I):
            return "similar"
    return "search"


async def resolve(
    query: str,
    user_id: str,
    context: dict | None = None,
) -> dict:
    """Resolve a natural-language query into an answer plus playable tracks.

    Returns:
        {
          "intent":   str,            # which branch answered
          "label":    str,            # short human label for the UI
          "message":  str,            # one-line explanation shown to the user
          "tracks":   list[dict],
          "category": dict | None,    # set for the category intent
          "week":     str | None,     # set for weekly-cached answers
        }
    """
    context = context or {}
    intent = detect_intent(query, context)
    subject = _clean_subject(query)

    from app.services.ytmusic_service import (
        category_meta,
        get_trending,
        search as yt_search,
    )

    # ── Trending ──────────────────────────────────────────────
    if intent == "trending":
        from app.services import weekly_cache

        data = await weekly_cache.get_or_set(
            "trending:20", lambda: _produce_trending(get_trending)
        )
        tracks = (data or {}).get("tracks", [])
        return {
            "intent":  "trending",
            "label":   "Trending this week",
            "message": "What's charting right now.",
            "tracks":  tracks,
            "category": None,
            "week":    (data or {}).get("week"),
        }

    # ── Category ──────────────────────────────────────────────
    if intent == "category":
        slug = _match_category(query)
        if slug:
            from app.services import weekly_cache

            data = await weekly_cache.get_or_set(
                f"category:{slug}:5", lambda: _produce_category(slug)
            )
            tracks = (data or {}).get("tracks", [])
            meta = category_meta(slug) or {}
            return {
                "intent":   "category",
                "label":    f"Top {meta.get('label', slug)} this week",
                "message":  f"The five biggest {meta.get('label', slug)} tracks this week.",
                "tracks":   tracks,
                "category": meta,
                "week":     (data or {}).get("week"),
            }

    # ── More like what's playing ──────────────────────────────
    if intent == "similar":
        track_id = context.get("track_id")
        tracks: list[dict] = []

        # Preferred source: the taste-weighted recommendation engine. It needs
        # MongoDB, so it is strictly optional — the artist-mix search below is
        # the always-available path (same two-tier strategy as /autoplay).
        if track_id:
            try:
                from app.core.database import db_available, get_db

                if db_available():
                    from app.services.recommendation_engine import (
                        get_autoplay_candidates,
                    )

                    candidates = await get_autoplay_candidates(
                        get_db(), user_id, track_id, limit=10
                    )
                    for candidate in candidates or []:
                        resolved = await _hydrate(candidate.get("track_id"))
                        if resolved:
                            tracks.append(resolved)
            except Exception as e:
                log.info("smart_search.similar.engine_failed", error=str(e))

        # Fall back to the playing artist's catalogue, then to the subject.
        if not tracks:
            seed = context.get("artist") or subject
            if seed:
                found = await yt_search(f"{seed} mix", filter="songs", limit=10)
                tracks = [
                    t for t in found.get("tracks", []) if t.get("id") != track_id
                ]

        if tracks:
            return {
                "intent":  "similar",
                "label":   "More like this",
                "message": (
                    f"Picked from what's playing: {context.get('title')}"
                    if context.get("title")
                    else "Similar tracks to your current song."
                ),
                "tracks":   tracks,
                "category": None,
                "week":     None,
            }

    # ── Liked / top ───────────────────────────────────────────
    if intent in {"liked", "top"}:
        tracks = await _user_tracks(user_id, liked_only=(intent == "liked"))
        if tracks:
            return {
                "intent":  intent,
                "label":   "Your liked songs" if intent == "liked" else "Your top tracks",
                "message": (
                    "Everything you've liked."
                    if intent == "liked"
                    else "Your most played tracks."
                ),
                "tracks":   tracks,
                "category": None,
                "week":     None,
            }

    # ── Artist catalogue ──────────────────────────────────────
    if intent == "artist":
        name = _ARTIST.sub("", subject, count=1).strip()
        if name:
            found = await yt_search(name, filter="songs", limit=12)
            tracks = found.get("tracks", [])
            if tracks:
                return {
                    "intent":  "artist",
                    "label":   f"Songs by {name}",
                    "message": f"Tracks from {name}.",
                    "tracks":   tracks,
                    "category": None,
                    "week":     None,
                }

    # ── Plain / play / download / shuffle all end as a search ─
    search_term = _PLAY.sub("", subject).strip() or subject or query
    found = await yt_search(search_term, filter=None, limit=20)
    tracks = found.get("tracks", [])
    return {
        "intent":   intent if intent in {"play", "download", "shuffle"} else "search",
        "label":    "Results",
        "message":  _message_for(intent, search_term),
        "tracks":   tracks,
        "albums":   found.get("albums", []),
        "artists":  found.get("artists", []),
        "playlists": found.get("playlists", []),
        "category": None,
        "week":     None,
    }


def _message_for(intent: str, term: str) -> str:
    if intent == "download":
        return f"Tap download on any {term} result to save it offline."
    if intent == "shuffle":
        return f"Shuffling {term}."
    return f"Showing results for “{term}”."


async def _produce_trending(fetcher) -> dict | None:
    from app.services import weekly_cache

    tracks = await fetcher(limit=20)
    if not tracks:
        return None
    return {"week": weekly_cache.current_bucket(), "tracks": tracks}


async def _produce_category(slug: str) -> dict | None:
    from app.services import weekly_cache
    from app.services.ytmusic_service import get_category_top

    tracks = await get_category_top(slug, limit=5)
    if not tracks:
        return None
    return {"week": weekly_cache.current_bucket(), "tracks": tracks}


async def _hydrate(track_id: str | None) -> dict | None:
    if not track_id:
        return None
    try:
        from app.routers.track_router import _hydrate_track

        return await _hydrate_track(track_id)
    except Exception:
        return None


async def _user_tracks(user_id: str, *, liked_only: bool) -> list[dict]:
    """Resolve the caller's liked or most-played tracks into full objects."""
    try:
        from app.services.local_history import read_history_local, read_liked_local

        ids = (
            await read_liked_local(user_id)
            if liked_only
            else [entry.get("id") for entry in await read_history_local(user_id)]
        )
        out: list[dict] = []
        for tid in ids[:20]:
            track = await _hydrate(tid)
            if track:
                out.append(track)
        return out
    except Exception:
        return []
