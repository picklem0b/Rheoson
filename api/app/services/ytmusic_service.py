from __future__ import annotations
import asyncio
import structlog
from ytmusicapi import YTMusic
from app.core.exceptions import SearchError

log = structlog.get_logger()

_ytm: YTMusic | None = None


def _get_ytm() -> YTMusic:
    global _ytm
    if _ytm is None:
        _ytm = YTMusic()
    return _ytm


# ── Parsers ───────────────────────────────────────────────────

def _thumb(thumbnails: list[dict]) -> str:
    if not thumbnails:
        return ""
    best = thumbnails[-1].get("url", "")
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
    Non-blocking search using run_in_executor + asyncio.gather.
    All 4 category searches run concurrently.
    """
    loop = asyncio.get_event_loop()

    def _search_songs():
        return _get_ytm().search(query, filter="songs", limit=limit)

    def _search_albums():
        return _get_ytm().search(query, filter="albums", limit=8)

    def _search_artists():
        return _get_ytm().search(query, filter="artists", limit=8)

    def _search_playlists():
        return _get_ytm().search(query, filter="playlists", limit=6)

    try:
        if filter in ("songs", "tracks", None):
            songs, albums, artists, playlists = await asyncio.gather(
                loop.run_in_executor(None, _search_songs),
                loop.run_in_executor(None, _search_albums),
                loop.run_in_executor(None, _search_artists),
                loop.run_in_executor(None, _search_playlists),
            )
        elif filter == "albums":
            albums  = await loop.run_in_executor(None, _search_albums)
            songs, artists, playlists = [], [], []
        elif filter == "artists":
            artists = await loop.run_in_executor(None, _search_artists)
            songs, albums, playlists = [], [], []
        elif filter == "playlists":
            playlists = await loop.run_in_executor(None, _search_playlists)
            songs, albums, artists = [], [], []
        else:
            songs   = await loop.run_in_executor(None, _search_songs)
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
    """
    Fast autocomplete suggestions — hits ytmusicapi's suggest endpoint.
    Returns in ~80ms, perfect for instant search dropdown.
    """
    loop = asyncio.get_event_loop()
    try:
        def _suggest():
            return _get_ytm().get_search_suggestions(query)
        results = await loop.run_in_executor(None, _suggest)
        # Returns list of strings
        return [r for r in results if isinstance(r, str)][:8]
    except Exception as e:
        log.warning("ytmusic.suggestions.failed", query=query, error=str(e))
        return []


async def get_track(video_id: str) -> dict:
    loop = asyncio.get_event_loop()
    try:
        def _get():
            return _get_ytm().get_song(video_id)
        data  = await loop.run_in_executor(None, _get)
        vd    = data.get("videoDetails", {})
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
    loop = asyncio.get_event_loop()
    try:
        def _s():
            return _get_ytm().search(query, filter="songs", limit=5)
        results = await loop.run_in_executor(None, _s)
        tracks  = [r for r in results if r.get("videoId")]
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