from __future__ import annotations
import structlog
from ytmusicapi import YTMusic
from app.core.exceptions import SearchError

log = structlog.get_logger()

# ── Init ──────────────────────────────────────────────────────
# Unauthenticated — no OAuth needed for search
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
    # ytmusicapi gives smallest → largest, take last
    best = thumbnails[-1].get("url", "")
    # Strip size params for full-res
    return best.split("=w")[0] if "=w" in best else best


def _duration_to_secs(d: str | None) -> float:
    """'3:45' or '1:02:30' → seconds."""
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
    vid_id  = r.get("videoId", "")

    return {
        "id":           vid_id,
        "title":        r.get("title", "Unknown"),
        "duration":     _duration_to_secs(r.get("duration")),
        "artworkUrl":   _thumb(r.get("thumbnails", [])),
        "youtubeId":    vid_id,
        "spotifyId":    None,
        "isDownloaded": False,
        "isLiked":      False,
        "streamUrl":    f"/api/stream/{vid_id}/audio" if vid_id else None,
        "artist": {
            "id":       artists[0].get("id", "")   if artists else "",
            "name":     artists[0].get("name", "") if artists else "Unknown Artist",
            "imageUrl": None,
            "genres":   [],
        },
        "album": {
            "id":          album.get("id", ""),
            "title":       album.get("name", ""),
            "artworkUrl":  _thumb(r.get("thumbnails", [])),
            "releaseYear": 0,
            "trackCount":  0,
            "artist": {
                "id":       artists[0].get("id", "")   if artists else "",
                "name":     artists[0].get("name", "") if artists else "",
                "imageUrl": None,
                "genres":   [],
            },
        },
    }


def _parse_album(r: dict) -> dict:
    artists = r.get("artists") or []
    return {
        "id":          r.get("browseId", ""),
        "title":       r.get("title", ""),
        "artworkUrl":  _thumb(r.get("thumbnails", [])),
        "releaseYear": int(r.get("year", 0) or 0),
        "trackCount":  0,
        "artist": {
            "id":       artists[0].get("id", "")   if artists else "",
            "name":     artists[0].get("name", "") if artists else "",
            "imageUrl": None,
            "genres":   [],
        },
    }


def _parse_artist(r: dict) -> dict:
    return {
        "id":       r.get("browseId", ""),
        "name":     r.get("artist", r.get("name", "")),
        "imageUrl": _thumb(r.get("thumbnails", [])),
        "genres":   [],
    }


def _parse_playlist(r: dict) -> dict:
    return {
        "id":         r.get("browseId", ""),
        "title":      r.get("title", ""),
        "artworkUrl": _thumb(r.get("thumbnails", [])),
        "trackCount": r.get("itemCount", 0),
        "source":     "youtube",
    }


# ── Public API ────────────────────────────────────────────────

async def search(
    query: str,
    filter: str | None = None,
    limit: int = 20,
) -> dict:
    """
    Search YouTube Music.
    filter: None | 'songs' | 'albums' | 'artists' | 'playlists'
    Returns dict matching SearchResultsSchema.
    """
    try:
        ytm = _get_ytm()

        if filter in ("songs", "tracks", None):
            # Search all categories when no filter
            songs     = ytm.search(query, filter="songs",     limit=limit)
            albums    = ytm.search(query, filter="albums",    limit=8)
            artists   = ytm.search(query, filter="artists",   limit=8)
            playlists = ytm.search(query, filter="playlists", limit=6)
        elif filter == "albums":
            songs, albums, artists, playlists = [], ytm.search(query, filter="albums", limit=limit), [], []
        elif filter == "artists":
            songs, albums, artists, playlists = [], [], ytm.search(query, filter="artists", limit=limit), []
        elif filter == "playlists":
            songs, albums, artists, playlists = [], [], [], ytm.search(query, filter="playlists", limit=limit)
        else:
            songs     = ytm.search(query, filter="songs",  limit=limit)
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


async def get_track(video_id: str) -> dict:
    """Get a single track by YouTube video ID."""
    try:
        ytm  = _get_ytm()
        data = ytm.get_song(video_id)
        vd   = data.get("videoDetails", {})
        thumb = vd.get("thumbnail", {}).get("thumbnails", [])
        return {
            "id":           video_id,
            "title":        vd.get("title", ""),
            "duration":     float(vd.get("lengthSeconds", 0)),
            "artworkUrl":   _thumb(thumb),
            "youtubeId":    video_id,
            "spotifyId":    None,
            "isDownloaded": False,
            "isLiked":      False,
            "streamUrl":    f"/api/stream/{video_id}/audio",
            "artist": {
                "id":       vd.get("channelId", ""),
                "name":     vd.get("author", ""),
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
                    "id":       vd.get("channelId", ""),
                    "name":     vd.get("author", ""),
                    "imageUrl": None,
                    "genres":   [],
                },
            },
        }
    except Exception as e:
        log.error("ytmusic.get_track.failed", video_id=video_id, error=str(e))
        raise SearchError(f"Could not fetch track {video_id}: {e}")


async def search_one(query: str) -> dict | None:
    """Return the single best matching track for a query string."""
    try:
        ytm     = _get_ytm()
        results = ytm.search(query, filter="songs", limit=5)
        tracks  = [r for r in results if r.get("videoId")]
        if not tracks:
            return None
        return _parse_track(tracks[0])
    except Exception as e:
        log.error("ytmusic.search_one.failed", query=query, error=str(e))
        return None


async def resolve_youtube_url(url: str) -> dict | None:
    """
    Extract video ID from a YouTube URL and fetch the track.
    Handles youtu.be and youtube.com/watch?v= formats.
    """
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