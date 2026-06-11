from __future__ import annotations
import asyncio
import structlog
from ytmusicapi import YTMusic
from app.core.exceptions import SearchError

log = structlog.get_logger()

# ── Singleton ─────────────────────────────────────────────────
# YTMusic() constructor hits the network on first call.
# Guard with a lock so concurrent requests don't each try to init.
# If init fails, _ytm_error is set and we raise immediately on all
# subsequent calls rather than retrying the failing constructor each time.

_ytm:        YTMusic | None  = None
_ytm_error:  Exception | None = None
_ytm_lock    = asyncio.Lock()


async def _get_ytm_async() -> YTMusic:
    """Thread-safe singleton getter. Raises if YTMusic can't initialise."""
    global _ytm, _ytm_error

    if _ytm is not None:
        return _ytm
    if _ytm_error is not None:
        raise SearchError(f"YTMusic unavailable: {_ytm_error}") from _ytm_error

    async with _ytm_lock:
        # Double-check inside lock
        if _ytm is not None:
            return _ytm
        if _ytm_error is not None:
            raise SearchError(f"YTMusic unavailable: {_ytm_error}") from _ytm_error

        loop = asyncio.get_event_loop()
        try:
            _ytm = await loop.run_in_executor(None, YTMusic)
            log.info("ytmusic.init.ok")
        except Exception as e:
            _ytm_error = e
            log.error("ytmusic.init.failed", error=str(e))
            raise SearchError(f"YTMusic failed to initialise: {e}") from e

    return _ytm


def _get_ytm() -> YTMusic:
    """Sync getter — only safe to call from executor threads."""
    if _ytm is None:
        raise SearchError("YTMusic not yet initialised")
    return _ytm


# ── Parsers ───────────────────────────────────────────────────

def _thumb(thumbnails: list[dict]) -> str:
    if not thumbnails:
        return ""
    best = thumbnails[-1].get("url", "")
    # Strip YouTube size suffix to get the largest available
    return best.split("=w")[0] if "=w" in best else best


def _safe(v, fallback="") -> str:
    return str(v) if v is not None else fallback


def _duration_to_secs(d: str | None) -> float:
    if not d:
        return 0.0
    parts = d.split(":")
    try:
        if len(parts) == 2:
            return int(parts[0]) * 60 + int(parts[1])
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    except ValueError:
        pass
    return 0.0


def _parse_track(r: dict) -> dict:
    artists = r.get("artists") or []
    album   = r.get("album") or {}
    vid_id  = _safe(r.get("videoId"))

    artist_id   = _safe(artists[0].get("id"))   if artists else ""
    artist_name = _safe(artists[0].get("name")) if artists else "Unknown Artist"

    return {
        "id":           vid_id,
        "title":        _safe(r.get("title"), "Unknown"),
        "duration":     _duration_to_secs(r.get("duration")),
        "artworkUrl":   _thumb(r.get("thumbnails", [])),
        "youtubeId":    vid_id,
        "spotifyId":    None,
        "isDownloaded": False,
        "isLiked":      False,
        "streamUrl":    f"/api/stream/{vid_id}/audio" if vid_id else None,
        "artist": {
            "id":       artist_id,
            "name":     artist_name,
            "imageUrl": None,
            "genres":   [],
        },
        "album": {
            "id":          _safe(album.get("id")),
            "title":       _safe(album.get("name")),
            "artworkUrl":  _thumb(r.get("thumbnails", [])),
            "releaseYear": 0,
            "trackCount":  0,
            "artist": {
                "id":       artist_id,
                "name":     artist_name,
                "imageUrl": None,
                "genres":   [],
            },
        },
    }


def _parse_album(r: dict) -> dict:
    artists = r.get("artists") or []
    return {
        "id":          _safe(r.get("browseId")),
        "title":       _safe(r.get("title")),
        "artworkUrl":  _thumb(r.get("thumbnails", [])),
        "releaseYear": int(r.get("year") or 0),
        "trackCount":  0,
        "artist": {
            "id":       _safe(artists[0].get("id"))   if artists else "",
            "name":     _safe(artists[0].get("name")) if artists else "",
            "imageUrl": None,
            "genres":   [],
        },
    }


def _parse_artist(r: dict) -> dict:
    return {
        "id":       _safe(r.get("browseId")),
        "name":     _safe(r.get("artist", r.get("name"))),
        "imageUrl": _thumb(r.get("thumbnails", [])),
        "genres":   [],
    }


def _parse_playlist(r: dict) -> dict:
    raw_count = r.get("itemCount", 0)
    try:
        count = int(str(raw_count).replace("K", "000").split(".")[0]) if raw_count else 0
    except Exception:
        count = 0
    return {
        "id":         _safe(r.get("browseId")),
        "title":      _safe(r.get("title")),
        "artworkUrl": _thumb(r.get("thumbnails", [])),
        "trackCount": count,
        "source":     "youtube",
    }


# ── Public API ────────────────────────────────────────────────

async def search(
    query: str,
    filter: str | None = None,
    limit: int = 20,
) -> dict:
    """
    Concurrent search across all categories using run_in_executor + gather.
    Ensures YTMusic is initialised before spawning threads.
    """
    # Ensure singleton is ready before any executor threads try to use it
    await _get_ytm_async()
    loop = asyncio.get_event_loop()

    def _songs():
        return _get_ytm().search(query, filter="songs", limit=limit)

    def _albums():
        return _get_ytm().search(query, filter="albums", limit=8)

    def _artists():
        return _get_ytm().search(query, filter="artists", limit=8)

    def _playlists():
        return _get_ytm().search(query, filter="playlists", limit=6)

    try:
        if filter in ("songs", "tracks", None):
            songs, albums, artists, playlists = await asyncio.gather(
                loop.run_in_executor(None, _songs),
                loop.run_in_executor(None, _albums),
                loop.run_in_executor(None, _artists),
                loop.run_in_executor(None, _playlists),
            )
        elif filter == "albums":
            albums = await loop.run_in_executor(None, _albums)
            songs, artists, playlists = [], [], []
        elif filter == "artists":
            artists = await loop.run_in_executor(None, _artists)
            songs, albums, playlists = [], [], []
        elif filter == "playlists":
            playlists = await loop.run_in_executor(None, _playlists)
            songs, albums, artists = [], [], []
        else:
            songs = await loop.run_in_executor(None, _songs)
            albums, artists, playlists = [], [], []

        return {
            "query":     query,
            "tracks":    [_parse_track(r)    for r in songs     if r.get("videoId")],
            "albums":    [_parse_album(r)    for r in albums    if r.get("browseId")],
            "artists":   [_parse_artist(r)   for r in artists   if r.get("browseId")],
            "playlists": [_parse_playlist(r) for r in playlists if r.get("browseId")],
        }

    except Exception as e:
        log.error("ytmusic.search.failed", query=query, error=str(e))
        raise SearchError(f"YouTube Music search failed: {e}")


async def get_suggestions(query: str) -> list[str]:
    await _get_ytm_async()
    loop = asyncio.get_event_loop()
    try:
        results = await loop.run_in_executor(None, lambda: _get_ytm().get_search_suggestions(query))
        return [r for r in results if isinstance(r, str)][:8]
    except Exception as e:
        log.warning("ytmusic.suggestions.failed", query=query, error=str(e))
        return []


async def get_track(video_id: str) -> dict:
    await _get_ytm_async()
    loop = asyncio.get_event_loop()
    try:
        data = await loop.run_in_executor(None, lambda: _get_ytm().get_song(video_id))
        vd   = data.get("videoDetails", {})
        thumb = vd.get("thumbnail", {}).get("thumbnails", [])
        vid   = _safe(vd.get("videoId", video_id))
        return {
            "id":           vid,
            "title":        _safe(vd.get("title")),
            "duration":     float(vd.get("lengthSeconds") or 0),
            "artworkUrl":   _thumb(thumb),
            "youtubeId":    vid,
            "spotifyId":    None,
            "isDownloaded": False,
            "isLiked":      False,
            "streamUrl":    f"/api/stream/{vid}/audio",
            "artist": {
                "id":       _safe(vd.get("channelId")),
                "name":     _safe(vd.get("author")),
                "imageUrl": None,
                "genres":   [],
            },
            "album": {
                "id":          "",
                "title":       "",
                "artworkUrl":  _thumb(thumb),
                "releaseYear": 0,
                "trackCount":  0,
                "artist": {
                    "id":       _safe(vd.get("channelId")),
                    "name":     _safe(vd.get("author")),
                    "imageUrl": None,
                    "genres":   [],
                },
            },
        }
    except Exception as e:
        log.error("ytmusic.get_track.failed", video_id=video_id, error=str(e))
        raise SearchError(f"Could not fetch track {video_id}: {e}")


async def search_one(query: str) -> dict | None:
    await _get_ytm_async()
    loop = asyncio.get_event_loop()
    try:
        results = await loop.run_in_executor(
            None,
            lambda: _get_ytm().search(query, filter="songs", limit=5),
        )
        tracks = [r for r in results if r.get("videoId")]
        return _parse_track(tracks[0]) if tracks else None
    except Exception as e:
        log.error("ytmusic.search_one.failed", query=query, error=str(e))
        return None


async def resolve_youtube_url(url: str) -> dict | None:
    import re
    patterns = [
        r'(?:youtube\.com/watch\?v=|youtu\.be/)([a-zA-Z0-9_-]{11})',
        r'youtube\.com/shorts/([a-zA-Z0-9_-]{11})',
    ]
    for pat in patterns:
        m = re.search(pat, url)
        if m:
            return await get_track(m.group(1))
    return None


async def get_trending(limit: int = 20) -> list[dict]:
    """
    Fetch trending/charts tracks from YouTube Music.
    Returns empty list on failure — caller handles gracefully.
    """
    await _get_ytm_async()
    loop = asyncio.get_event_loop()
    try:
        # get_charts returns a rich object; we extract the trending songs
        charts = await loop.run_in_executor(None, lambda: _get_ytm().get_charts())
        trending = charts.get("songs", {}).get("items", [])
        return [_parse_track(r) for r in trending[:limit] if r.get("videoId")]
    except Exception as e:
        log.warning("ytmusic.trending.failed", error=str(e))
        return []