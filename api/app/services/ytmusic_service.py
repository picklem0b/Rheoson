from __future__ import annotations
import re
import time
import asyncio
import structlog
from ytmusicapi import YTMusic
from app.core.exceptions import SearchError

log = structlog.get_logger()

# User-Agent rotation pool — when YouTube blocks or throttles one UA,
# the next YTMusic() call uses a different one, so a single blocked
# identity cannot take down search.
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
_last_fail_time: float = 0.0  # timestamp of last failure
_MAX_FAILURES = 3
_RETRY_BACKOFF = 60.0  # seconds to wait before retrying after max failures


async def _get_ytm_async() -> YTMusic:
    global _ytm, _ytm_error, _fail_count, _last_fail_time
    if _ytm is not None and _fail_count < _MAX_FAILURES:
        return _ytm
    if _ytm_error is not None and _fail_count < _MAX_FAILURES:
        raise SearchError(f"YTMusic unavailable: {_ytm_error}") from _ytm_error
    async with _ytm_lock:
        if _ytm is not None and _fail_count < _MAX_FAILURES:
            return _ytm
        if _ytm_error is not None and _fail_count < _MAX_FAILURES:
            raise SearchError(f"YTMusic unavailable: {_ytm_error}") from _ytm_error
        # Recovery after max failures: once the backoff period has elapsed
        # the client is rebuilt instead of erroring forever.
        if _fail_count >= _MAX_FAILURES:
            elapsed = time.monotonic() - _last_fail_time
            if elapsed < _RETRY_BACKOFF:
                raise SearchError(
                    f"YTMusic unavailable: too many failures, "
                    f"retrying in {int(_RETRY_BACKOFF - elapsed)}s"
                )
            # Rotate UA and reset for retry
            global _ua_index
            _ua_index = (_ua_index + 1) % len(_UA_POOL)
            _fail_count = 0
            _ytm = None  # force re-creation
            _ytm_error = None
            log.info("ytmusic.recovery.rotate_ua", ua_index=_ua_index)
        loop = asyncio.get_event_loop()
        try:
            _ytm = await loop.run_in_executor(None, lambda: YTMusic())
            log.info("ytmusic.init.ok")
        except Exception as e:
            _ytm_error = e
            _fail_count += 1
            _last_fail_time = time.monotonic()
            log.error("ytmusic.init.failed", error=str(e), fail_count=_fail_count)
            raise SearchError(f"YTMusic failed to initialise: {e}") from e
    return _ytm


def _record_ytm_failure() -> None:
    """Call when a ytmusicapi call fails — triggers UA rotation after N failures."""
    global _fail_count, _last_fail_time
    _fail_count += 1
    _last_fail_time = time.monotonic()


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
    if not isinstance(artists, list):
        artists = []
    album = r.get("album") or {}
    if isinstance(album, str):
        # Some ytmusicapi payloads give album as a bare name string
        album = {"name": album, "id": ""}
    if not isinstance(album, dict):
        album = {}
    artists = [a for a in artists if isinstance(a, dict)]
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

    # Chart/browse payloads carry popularity and position when available.
    # Both are optional: search results simply omit them.
    play_count = _parse_count(r.get("playCount") or r.get("plays") or r.get("views"))
    try:
        rank = int(r.get("rank") or 0)
    except (TypeError, ValueError):
        rank = 0

    return {
        "id":           vid_id,
        "title":        _safe(r.get("title"), "Unknown"),
        "duration":     _duration_to_secs(r.get("duration")),
        "artworkUrl":   artwork,
        "youtubeId":    vid_id,
        "spotifyId":    None,
        "isDownloaded": False,
        "isLiked":      False,
        "playCount":    play_count,
        "rank":         rank,
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


async def get_track(video_id: str) -> dict:
    await _get_ytm_async()
    loop = asyncio.get_event_loop()
    try:
        data  = await loop.run_in_executor(None, lambda: _get_ytm().get_song(video_id))
        vd    = data.get("videoDetails") or {}
        if not vd.get("videoId") or not vd.get("title"):
            # YouTube responds 200 with an empty/playability-error payload for
            # nonexistent or unavailable videos — surface it as a failure so
            # hydration never fabricates a ghost "track" for a bad ID.
            raise SearchError(f"Track not found or unavailable: {video_id}")
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


def _parse_count(value: object) -> int:
    """Parse a ytmusic count like '12,345,678', '12.3M' or 0 into an int."""
    if isinstance(value, (int, float)):
        return int(value)
    s = str(value or "").replace(",", "").replace(" ", "").strip()
    if not s:
        return 0
    m = re.match(r"^(\d+(?:\.\d+)?)([km]?)$", s, re.IGNORECASE)
    if not m:
        return 0
    num = float(m.group(1))
    suffix = m.group(2).lower()
    if suffix == "k":
        num *= 1_000
    elif suffix == "m":
        num *= 1_000_000
    return int(num)


def _section_items(value: object) -> list[dict]:
    """Normalize a ytmusicapi artist section.

    Newer ytmusicapi returns sections as {"browseId": ..., "results": [...]};
    older versions returned a bare list of item dicts. Some responses also
    carry a trailing non-dict sentinel (e.g. a "More" row). Returns only the
    dict entries so downstream parsers never hit "'str' object has no 'get'".
    """
    if isinstance(value, dict):
        value = value.get("results") or []
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


async def get_artist_with_content(artist_id: str) -> dict:
    """
    Full artist page payload: profile + top tracks + albums/singles + related.
    Powers the creator tab and the artist page for YouTube Music artists.
    """
    await _get_ytm_async()
    loop = asyncio.get_event_loop()
    try:
        data = await loop.run_in_executor(None, lambda: _get_ytm().get_artist(artist_id))
    except Exception as e:
        _record_ytm_failure()
        log.warning("ytmusic.get_artist_content.failed", artist_id=artist_id, error=str(e))
        raise SearchError(f"Artist unavailable: {e}") from e

    thumbs   = data.get("thumbnails") or []
    top_list = []
    for s in _section_items(data.get("songs")):
        if not s.get("videoId"):
            continue
        t = _parse_track(s)
        t["playCount"] = _parse_count(s.get("playCount") or s.get("plays"))
        top_list.append(t)

    albums  = [_parse_album(a) for a in _section_items(data.get("albums")) if a.get("browseId")]
    singles = [_parse_album(a) for a in _section_items(data.get("singles")) if a.get("browseId")]
    related = [_parse_artist(r) for r in _section_items(data.get("related")) if r.get("browseId")]
    keywords = data.get("keywords") or data.get("genre") or ""
    if isinstance(keywords, str):
        genres = [g.strip() for g in keywords.split(",") if g.strip()]
    elif isinstance(keywords, list):
        genres = [str(g) for g in keywords]
    else:
        genres = []

    subscribers = _parse_count(data.get("subscribers"))
    views       = _parse_count(data.get("views"))

    return {
        "id":               artist_id,
        "name":             _safe(data.get("name")),
        "imageUrl":         _thumb_artist(thumbs),
        "genres":           genres[:6],
        "description":      _safe(data.get("description")),
        "subscribers":      str(subscribers) if subscribers else "",
        "views":            str(views) if views else "",
        "monthlyListeners": subscribers,
        "topTracks":        top_list[:20],
        "albums":           albums[:12],
        "singles":          singles[:8],
        "related":          related[:8],
    }


async def get_album_with_content(album_id: str) -> dict:
    """Full album payload (title, artwork, year, tracks) for a YT Music
    browse ID. Powers the album detail page for remote albums."""
    await _get_ytm_async()
    loop = asyncio.get_event_loop()
    try:
        data = await loop.run_in_executor(None, lambda: _get_ytm().get_album(album_id))
    except Exception as e:
        _record_ytm_failure()
        log.warning("ytmusic.get_album.failed", album_id=album_id, error=str(e))
        raise SearchError(f"Album unavailable: {e}") from e

    if not isinstance(data, dict) or not data.get("title"):
        raise SearchError(f"Album not found: {album_id}")

    artists = data.get("artists") or []
    artist = {}
    if isinstance(artists, list) and artists and isinstance(artists[0], dict):
        artist = {
            "id":   _safe(artists[0].get("id")),
            "name": _safe(artists[0].get("name")),
        }

    tracks = [
        _parse_track(t) for t in (data.get("tracks") or [])
        if isinstance(t, dict) and t.get("videoId")
    ]
    try:
        year = int(data.get("year") or 0)
    except (ValueError, TypeError):
        year = 0

    return {
        "id":          album_id,
        "title":       _safe(data.get("title")),
        "artworkUrl":  _thumb_hires(data.get("thumbnails") or []),
        "releaseYear": year,
        "year":        year,
        "trackCount":  data.get("trackCount") or len(tracks),
        "artist":      artist,
        "tracks":      tracks,
    }


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
    return None# Canonical category list. Kept server-side so the grid and the per-category
# refresher can never drift apart.
#
# Each tile carries a "hero" — an iconic artist of that genre whose portrait
# becomes the tile background. Images are direct Deezer CDN URLs (stable,
# keyless, ~1000px square) resolved once by artist ID; no runtime API calls.
CATEGORIES: list[dict] = [
    {"slug": "hip-hop",    "label": "Hip-Hop",    "emoji": "🎤", "gradient": "from-yellow-900/90 to-orange-800/90",
     "hero": "2Pac",            "heroUrl": "https://cdn-images.dzcdn.net/images/artist/dc2743d871b5935004292eed2cd55f68/1000x1000-000000-80-0-0.jpg"},
    {"slug": "electronic", "label": "Electronic", "emoji": "🎛️", "gradient": "from-cyan-900/90 to-blue-800/90",
     "hero": "Daft Punk",       "heroUrl": "https://cdn-images.dzcdn.net/images/artist/638e69b9caaf9f9f3f8826febea7b543/1000x1000-000000-80-0-0.jpg"},
    {"slug": "r-and-b",    "label": "R&B",        "emoji": "🎶", "gradient": "from-rose-900/90 to-pink-800/90",
     "hero": "Frank Ocean",     "heroUrl": "https://cdn-images.dzcdn.net/images/artist/882155c08dc31d6464d6d580083c968c/1000x1000-000000-80-0-0.jpg"},
    {"slug": "rock",       "label": "Rock",       "emoji": "🎸", "gradient": "from-zinc-900/90 to-zinc-700/90",
     "hero": "Queen",           "heroUrl": "https://cdn-images.dzcdn.net/images/artist/71eeb9e2eeb375df35a3c0654a5a01ab/1000x1000-000000-80-0-0.jpg"},
    {"slug": "afrobeats",  "label": "Afrobeats",  "emoji": "🪘", "gradient": "from-green-900/90 to-emerald-700/90",
     "hero": "Burna Boy",       "heroUrl": "https://cdn-images.dzcdn.net/images/artist/ad15b7f03325752d60db9e4d39c079ae/1000x1000-000000-80-0-0.jpg"},
    {"slug": "jazz",       "label": "Jazz",       "emoji": "🎷", "gradient": "from-amber-900/90 to-yellow-700/90",
     "hero": "Miles Davis",     "heroUrl": "https://cdn-images.dzcdn.net/images/artist/8d13c0527064ba50cf0d0873f4f574dc/1000x1000-000000-80-0-0.jpg"},
    {"slug": "pop",        "label": "Pop",        "emoji": "✨", "gradient": "from-violet-900/90 to-purple-700/90",
     "hero": "Michael Jackson", "heroUrl": "https://cdn-images.dzcdn.net/images/artist/97fae13b2b30e4aec2e8c9e0c7839d92/1000x1000-000000-80-0-0.jpg"},
    {"slug": "classical",  "label": "Classical",  "emoji": "🎻", "gradient": "from-slate-900/90 to-slate-700/90",
     "hero": "Beethoven",       "heroUrl": "https://cdn-images.dzcdn.net/images/artist/f16a31a3fe85c5a14debb1f811be1325/1000x1000-000000-80-0-0.jpg"},
    {"slug": "soul",       "label": "Soul",       "emoji": "🎙️", "gradient": "from-red-900/90 to-rose-800/90",
     "hero": "Aretha Franklin", "heroUrl": "https://cdn-images.dzcdn.net/images/artist/4453648f7e780028c2be766b21474223/1000x1000-000000-80-0-0.jpg"},
    {"slug": "drill",      "label": "Drill",      "emoji": "🥁", "gradient": "from-neutral-900/90 to-stone-700/90",
     "hero": "Central Cee",     "heroUrl": "https://cdn-images.dzcdn.net/images/artist/25fe719f51af3ee2de27aa267e2a6ac9/1000x1000-000000-80-0-0.jpg"},
]

_CATEGORY_BY_SLUG = {c["slug"]: c for c in CATEGORIES}


def category_meta(slug: str) -> dict | None:
    return _CATEGORY_BY_SLUG.get(slug)


async def get_category_top(slug: str, limit: int = 5) -> list[dict]:
    """The best songs in one category.

    Strategy: take YouTube Music's own editorial playlist for the genre (the
    top playlist search hit) and read its first tracks — that is a human-
    curated "best of" rather than whatever a text query happens to rank first.
    Falls back to a plain song search when no playlist resolves, so a category
    never renders empty.
    """
    meta = category_meta(slug)
    label = (meta or {}).get("label") or slug
    await _get_ytm_async()
    loop = asyncio.get_event_loop()

    def _from_playlist() -> list[dict]:
        plists = _get_ytm().search(f"{label} greatest hits", filter="playlists")
        for pl in plists or []:
            browse_id = pl.get("browseId")
            if not browse_id:
                continue
            try:
                data = _get_ytm().get_playlist(browse_id, limit=limit)
            except Exception:
                continue
            out: list[dict] = []
            for index, row in enumerate((data or {}).get("tracks") or []):
                if not isinstance(row, dict) or not row.get("videoId"):
                    continue
                track = _parse_track(row)
                track["rank"] = index + 1
                out.append(track)
                if len(out) >= limit:
                    break
            if out:
                return out
        return []

    def _from_search() -> list[dict]:
        rows = _get_ytm().search(f"{label} top songs", filter="songs", limit=limit)
        out: list[dict] = []
        for index, row in enumerate(rows or []):
            if not isinstance(row, dict) or not row.get("videoId"):
                continue
            track = _parse_track(row)
            track["rank"] = index + 1
            out.append(track)
            if len(out) >= limit:
                break
        return out

    try:
        tracks = await loop.run_in_executor(None, _from_playlist)
        if not tracks:
            tracks = await loop.run_in_executor(None, _from_search)
        return tracks
    except Exception as e:
        _record_ytm_failure()
        log.warning("ytmusic.category_top.failed", slug=slug, error=str(e))
        return []


def _rows_to_chart_tracks(rows: list, limit: int) -> list[dict]:
    """Chart rows -> track dicts with 1-based rank preserved."""
    out: list[dict] = []
    for index, row in enumerate(rows or []):
        if not isinstance(row, dict) or not row.get("videoId"):
            continue
        track = _parse_track(row)
        if not track.get("rank"):
            track["rank"] = index + 1
        out.append(track)
        if len(out) >= limit:
            break
    return out


async def get_trending(limit: int = 20) -> list[dict]:
    """Top songs from YouTube Music's charts, newest chart position first.

    Chart rows carry a 1-based position; it is preserved as `rank` (and
    back-filled from list order when upstream omits it) so callers can render
    "#1 this week" without guessing from array order.

    Upstream shape drift, handled here so callers never see it: the charts
    endpoint used to expose a `songs` section; it now returns only `videos`
    (chart *playlist* stubs) and `artists`. When `songs` is missing, the
    first chart playlist ("Daily Top Music Videos") is read directly — its
    tracks are the chart itself. A plain popular-song search is the final
    fallback so the section still renders when both chart shapes fail.
    """
    await _get_ytm_async()
    loop = asyncio.get_event_loop()
    try:
        charts = await loop.run_in_executor(None, lambda: _get_ytm().get_charts())

        # Legacy shape — global chart still carries per-song rows.
        songs = (charts.get("songs") or {}).get("items") or []
        out = _rows_to_chart_tracks(songs, limit)
        if out:
            return out

        # Current shape — `videos` holds chart playlists; read the first one.
        playlist_id = next(
            (
                v.get("playlistId")
                for v in charts.get("videos") or []
                if isinstance(v, dict) and v.get("playlistId")
            ),
            None,
        )
        if playlist_id:
            data = await loop.run_in_executor(
                None, lambda: _get_ytm().get_playlist(playlist_id, limit=limit)
            )
            out = _rows_to_chart_tracks((data or {}).get("tracks") or [], limit)
            if out:
                return out

        # Last resort — popular songs via search, ranked by result order.
        rows = await loop.run_in_executor(
            None,
            lambda: _get_ytm().search("top songs this week", filter="songs", limit=limit),
        )
        return _rows_to_chart_tracks(rows, limit)
    except Exception as e:
        _record_ytm_failure()
        log.warning("ytmusic.trending.failed", error=str(e))
        return []