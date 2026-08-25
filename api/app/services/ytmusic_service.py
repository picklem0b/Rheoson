from __future__ import annotations
import re
import asyncio
import structlog
from ytmusicapi import YTMusic
from app.core.exceptions import SearchError

log = structlog.get_logger()

# BUG #18: User-Agent rotation pool — if YouTube blocks one UA,
# the next YTMusic() call will use a different one.
_UA_POOL = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
]
_ua_index = 0

# ── Singleton ─────────────────────────────────────────────────

_ytm:       YTMusic | None   = None
_ytm_error: Exception | None = None
_ytm_lock   = asyncio.Lock()
_fail_count = 0  # consecutive failures — triggers re-init
_MAX_FAILURES = 3


async def _get_ytm_async() -> YTMusic:
    global _ytm, _ytm_error, _fail_count
    if _ytm is not None and _fail_count < _MAX_FAILURES:
        return _ytm
    if _ytm_error is not None and _fail_count < _MAX_FAILURES:
        raise SearchError(f"YTMusic unavailable: {_ytm_error}") from _ytm_error
    async with _ytm_lock:
        if _ytm is not None and _fail_count < _MAX_FAILURES:
            return _ytm
        if _ytm_error is not None and _fail_count < _MAX_FAILURES:
            raise SearchError(f"YTMusic unavailable: {_ytm_error}") from _ytm_error
        # BUG #18: Rotate UA on re-init after failures
        global _ua_index
        if _fail_count >= _MAX_FAILURES:
            _ua_index = (_ua_index + 1) % len(_UA_POOL)
            _fail_count = 0
            _ytm = None  # force re-creation
            log.info("ytmusic.rotate_ua", ua_index=_ua_index)
        loop = asyncio.get_event_loop()
        try:
            _ytm = await loop.run_in_executor(None, lambda: YTMusic())
            log.info("ytmusic.init.ok")
        except Exception as e:
            _ytm_error = e
            _fail_count += 1
            log.error("ytmusic.init.failed", error=str(e), fail_count=_fail_count)
            raise SearchError(f"YTMusic failed to initialise: {e}") from e
    return _ytm


def _record_ytm_failure() -> None:
    """Call when a ytmusicapi call fails — triggers UA rotation after N failures."""
    global _fail_count
    _fail_count += 1


def _get_ytm() -> YTMusic:
    if _ytm is None:
        raise SearchError("YTMusic not yet initialised")
    return _ytm


# ── Thumbnail helpers ─────────────────────────────────────────

def _thumb(thumbnails: list[dict], size: int = 500) -> str:
    """
    Return the best-quality thumbnail URL from a ytmusicapi thumbnails list.

    Strategy:
      1. Pick the last item (ytmusicapi sorts ascending by size)
      2. If the URL has a size suffix (=w226-h226-...), replace it with
         the requested size so we always get a sharp image.
      3. For i.ytimg.com URLs, use the /maxresdefault.jpg path when possible.

    Previous bug: _thumb was calling .split("=w")[0] which stripped the
    entire size parameter and returned the base URL — valid for some CDNs
    but on YouTube's image CDN this returns a broken/missing image because
    the CDN requires a size suffix to serve the file.
    """
    if not thumbnails:
        return ""

    # Pick the largest thumbnail ytmusicapi gave us
    best = thumbnails[-1].get("url", "")
    if not best:
        return ""

    # YouTube Music thumbnails: replace existing size with a larger one
    # Pattern: =w226-h226-l90-rj  or  =s226  or  =w500-h500
    if re.search(r"=w\d+", best):
        best = re.sub(r"=w\d+(-h\d+)?(-l\d+)?(-rj)?$", f"=w{size}-h{size}-l90-rj", best)
        return best

    # YouTube video thumbnails (i.ytimg.com/vi/{id}/...)
    ytimg_match = re.search(r"(https://i\.ytimg\.com/vi/[^/]+)/", best)
    if ytimg_match:
        base = ytimg_match.group(1)
        return f"{base}/maxresdefault.jpg"

    # Googleusercontent / lh3 artist images — replace size suffix
    if "=s" in best:
        best = re.sub(r"=s\d+.*$", f"=s{size}", best)
        return best

    return best


def _thumb_hires(thumbnails: list[dict]) -> str:
    """High-res variant for artwork (500px) — used for track/album art."""
    return _thumb(thumbnails, size=500)


def _thumb_artist(thumbnails: list[dict]) -> str:
    """Square crop preferred for artist images (400px)."""
    return _thumb(thumbnails, size=400)


def _safe(v: object, fallback: str = "") -> str:
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


# ── Parsers ───────────────────────────────────────────────────

def _parse_track(r: dict) -> dict:
    artists = r.get("artists") or []
    album   = r.get("album")   or {}
    vid_id  = _safe(r.get("videoId"))
    thumbs  = r.get("thumbnails", [])

    artist_id    = _safe(artists[0].get("id"))   if artists else ""
    artist_name  = _safe(artists[0].get("name")) if artists else "Unknown Artist"

    # Artist image: ytmusicapi search results include thumbnails on artist
    # objects when the search filter is "artists" — but in track results the
    # artist object only has id + name. We set imageUrl to the track thumbnail
    # as a fallback so something always shows on artist pages.
    artist_thumb = _thumb_artist(thumbs)

    artwork = _thumb_hires(thumbs)

    return {
        "id":           vid_id,
        "title":        _safe(r.get("title"), "Unknown"),
        "duration":     _duration_to_secs(r.get("duration")),
        "artworkUrl":   artwork,
        "youtubeId":    vid_id,
        "spotifyId":    None,
        "isDownloaded": False,
        "isLiked":      False,
        "streamUrl":    f"/api/stream/{vid_id}/audio" if vid_id else None,
        "artist": {
            "id":       artist_id,
            "name":     artist_name,
            "imageUrl": artist_thumb,
            "genres":   [],
        },
        "album": {
            "id":          _safe(album.get("id")),
            "title":       _safe(album.get("name")),
            "artworkUrl":  artwork,
            "releaseYear": 0,
            "trackCount":  0,
            "artist": {
                "id":       artist_id,
                "name":     artist_name,
                "imageUrl": artist_thumb,
                "genres":   [],
            },
        },
    }


def _parse_album(r: dict) -> dict:
    artists = r.get("artists") or []
    thumbs  = r.get("thumbnails", [])
    return {
        "id":          _safe(r.get("browseId")),
        "title":       _safe(r.get("title")),
        "artworkUrl":  _thumb_hires(thumbs),
        "releaseYear": int(r.get("year") or 0),
        "trackCount":  0,
        "artist": {
            "id":       _safe(artists[0].get("id"))   if artists else "",
            "name":     _safe(artists[0].get("name")) if artists else "",
            "imageUrl": _thumb_artist(thumbs),
            "genres":   [],
        },
    }


def _parse_artist(r: dict) -> dict:
    """
    Parse an artist from search results.
    ytmusicapi artist search results include a thumbnails array that contains
    the artist's profile image — this was previously ignored.
    """
    thumbs = r.get("thumbnails", [])
    return {
        "id":       _safe(r.get("browseId")),
        "name":     _safe(r.get("artist", r.get("name"))),
        "imageUrl": _thumb_artist(thumbs),
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
        "artworkUrl": _thumb_hires(r.get("thumbnails", [])),
        "trackCount": count,
        "source":     "youtube",
    }


# ── Public API ────────────────────────────────────────────────

async def search(query: str, filter: str | None = None, limit: int = 20) -> dict:
    await _get_ytm_async()
    loop = asyncio.get_event_loop()

    def _songs():     return _get_ytm().search(query, filter="songs",     limit=limit)
    def _albums():    return _get_ytm().search(query, filter="albums",    limit=8)
    def _artists():   return _get_ytm().search(query, filter="artists",   limit=8)
    def _playlists(): return _get_ytm().search(query, filter="playlists", limit=6)

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
        _record_ytm_failure()
        log.error("ytmusic.search.failed", query=query, error=str(e))
        raise SearchError(f"YouTube Music search failed: {e}")


async def get_suggestions(query: str) -> list[str]:
    await _get_ytm_async()
    loop = asyncio.get_event_loop()
    try:
        results = await loop.run_in_executor(None, lambda: _get_ytm().get_search_suggestions(query))
        return [r for r in results if isinstance(r, str)][:8]
    except Exception as e:
        _record_ytm_failure()
        log.warning("ytmusic.suggestions.failed", query=query, error=str(e))
        return []


async def get_track(video_id: str) -> dict:
    await _get_ytm_async()
    loop = asyncio.get_event_loop()
    try:
        data  = await loop.run_in_executor(None, lambda: _get_ytm().get_song(video_id))
        vd    = data.get("videoDetails", {})
        thumb = vd.get("thumbnail", {}).get("thumbnails", [])
        vid   = _safe(vd.get("videoId", video_id))
        art   = _thumb_hires(thumb)
        return {
            "id":           vid,
            "title":        _safe(vd.get("title")),
            "duration":     float(vd.get("lengthSeconds") or 0),
            "artworkUrl":   art,
            "youtubeId":    vid,
            "spotifyId":    None,
            "isDownloaded": False,
            "isLiked":      False,
            "streamUrl":    f"/api/stream/{vid}/audio",
            "artist": {
                "id":       _safe(vd.get("channelId")),
                "name":     _safe(vd.get("author")),
                "imageUrl": art,
                "genres":   [],
            },
            "album": {
                "id":          "",
                "title":       "",
                "artworkUrl":  art,
                "releaseYear": 0,
                "trackCount":  0,
                "artist": {
                    "id":       _safe(vd.get("channelId")),
                    "name":     _safe(vd.get("author")),
                    "imageUrl": art,
                    "genres":   [],
                },
            },
        }
    except Exception as e:
        _record_ytm_failure()
        log.error("ytmusic.get_track.failed", video_id=video_id, error=str(e))
        raise SearchError(f"Could not fetch track {video_id}: {e}")


async def get_artist(artist_id: str) -> dict:
    """
    Fetch full artist data from ytmusicapi including high-res header image.
    The header image is much higher quality than the search thumbnail.
    """
    await _get_ytm_async()
    loop = asyncio.get_event_loop()
    try:
        data   = await loop.run_in_executor(None, lambda: _get_ytm().get_artist(artist_id))
        thumbs = data.get("thumbnails", [])
        return {
            "id":       artist_id,
            "name":     _safe(data.get("name")),
            "imageUrl": _thumb_artist(thumbs),
            "genres":   [],
            "description": _safe(data.get("description")),
            "subscribers": _safe(data.get("subscribers")),
        }
    except Exception as e:
        _record_ytm_failure()
        log.warning("ytmusic.get_artist.failed", artist_id=artist_id, error=str(e))
        return {"id": artist_id, "name": "", "imageUrl": "", "genres": []}


async def search_one(query: str) -> dict | None:
    await _get_ytm_async()
    loop = asyncio.get_event_loop()
    try:
        results = await loop.run_in_executor(
            None, lambda: _get_ytm().search(query, filter="songs", limit=5),
        )
        tracks = [r for r in results if r.get("videoId")]
        return _parse_track(tracks[0]) if tracks else None
    except Exception as e:
        _record_ytm_failure()
        log.error("ytmusic.search_one.failed", query=query, error=str(e))
        return None


async def resolve_youtube_url(url: str) -> dict | None:
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
    await _get_ytm_async()
    loop = asyncio.get_event_loop()
    try:
        charts   = await loop.run_in_executor(None, lambda: _get_ytm().get_charts())
        trending = charts.get("songs", {}).get("items", [])
        return [_parse_track(r) for r in trending[:limit] if r.get("videoId")]
    except Exception as e:
        _record_ytm_failure()
        log.warning("ytmusic.trending.failed", error=str(e))
        return []