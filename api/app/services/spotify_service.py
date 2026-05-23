from __future__ import annotations
import re
import httpx
import structlog
from typing import Optional
from app.core.config import settings
from app.core.exceptions import SpotifyError

log = structlog.get_logger()

# ── URL patterns ──────────────────────────────────────────────
_TRACK_RE    = re.compile(r'open\.spotify\.com/track/([A-Za-z0-9]+)')
_ALBUM_RE    = re.compile(r'open\.spotify\.com/album/([A-Za-z0-9]+)')
_PLAYLIST_RE = re.compile(r'open\.spotify\.com/playlist/([A-Za-z0-9]+)')
_ARTIST_RE   = re.compile(r'open\.spotify\.com/artist/([A-Za-z0-9]+)')

_token_cache: dict[str, str] = {}   # simple in-memory, refreshed when expired


async def _get_token() -> str:
    """Fetch a Spotify client-credentials token. Cached in memory."""
    if not settings.has_spotify:
        raise SpotifyError("Spotify credentials not configured")

    # Return cached token if still valid
    if _token_cache.get("token"):
        return _token_cache["token"]

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            "https://accounts.spotify.com/api/token",
            data={"grant_type": "client_credentials"},
            auth=(settings.SPOTIFY_CLIENT_ID, settings.SPOTIFY_CLIENT_SECRET),
        )
        if resp.status_code != 200:
            raise SpotifyError(f"Token fetch failed: {resp.status_code}")

        data  = resp.json()
        token = data.get("access_token", "")
        if not token:
            raise SpotifyError("Empty token from Spotify")

        _token_cache["token"] = token

        # Schedule cache clear after expires_in seconds
        import asyncio
        expires_in = data.get("expires_in", 3600)
        asyncio.get_event_loop().call_later(
            expires_in - 60,    # clear 60s before expiry
            _token_cache.clear,
        )
        return token


async def _get(path: str) -> dict:
    """Authenticated GET to Spotify API."""
    token = await _get_token()
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"https://api.spotify.com/v1{path}",
            headers={"Authorization": f"Bearer {token}"},
        )
        if resp.status_code == 401:
            # Token expired — clear cache and retry once
            _token_cache.clear()
            token = await _get_token()
            resp  = await client.get(
                f"https://api.spotify.com/v1{path}",
                headers={"Authorization": f"Bearer {token}"},
            )
        if resp.status_code != 200:
            raise SpotifyError(f"Spotify API error {resp.status_code}: {path}")
        return resp.json()


# ── Parsers ───────────────────────────────────────────────────

def _parse_image(images: list[dict]) -> str:
    if not images:
        return ""
    # Prefer the largest image
    return sorted(images, key=lambda x: x.get("width", 0), reverse=True)[0].get("url", "")


def _parse_artist(a: dict) -> dict:
    return {
        "id":       a.get("id", ""),
        "name":     a.get("name", ""),
        "imageUrl": _parse_image(a.get("images", [])),
        "genres":   a.get("genres", []),
    }


def _parse_album(al: dict) -> dict:
    artists = al.get("artists", [])
    return {
        "id":          al.get("id", ""),
        "title":       al.get("name", ""),
        "artworkUrl":  _parse_image(al.get("images", [])),
        "releaseYear": int(al.get("release_date", "0")[:4] or 0),
        "trackCount":  al.get("total_tracks", 0),
        "artist": {
            "id":       artists[0].get("id", "")   if artists else "",
            "name":     artists[0].get("name", "") if artists else "",
            "imageUrl": "",
            "genres":   [],
        },
    }


def _parse_track(t: dict) -> dict:
    album   = t.get("album", {})
    artists = t.get("artists", [])
    return {
        "id":           t.get("id", ""),
        "title":        t.get("name", ""),
        "duration":     t.get("duration_ms", 0) / 1000,
        "artworkUrl":   _parse_image(album.get("images", [])),
        "spotifyId":    t.get("id", ""),
        "isDownloaded": False,
        "isLiked":      False,
        "artist": {
            "id":       artists[0].get("id", "")   if artists else "",
            "name":     artists[0].get("name", "") if artists else "",
            "imageUrl": "",
            "genres":   [],
        },
        "album": _parse_album(album),
    }


# ── Public API ────────────────────────────────────────────────

def detect_spotify_type(url: str) -> Optional[str]:
    """Returns 'track' | 'album' | 'playlist' | 'artist' | None."""
    if _TRACK_RE.search(url):    return "track"
    if _ALBUM_RE.search(url):    return "album"
    if _PLAYLIST_RE.search(url): return "playlist"
    if _ARTIST_RE.search(url):   return "artist"
    return None


def extract_spotify_id(url: str, kind: str) -> Optional[str]:
    patterns = {
        "track":    _TRACK_RE,
        "album":    _ALBUM_RE,
        "playlist": _PLAYLIST_RE,
        "artist":   _ARTIST_RE,
    }
    m = patterns[kind].search(url)
    return m.group(1) if m else None


async def get_track(track_id: str) -> dict:
    data = await _get(f"/tracks/{track_id}")
    return _parse_track(data)


async def get_album(album_id: str) -> dict:
    data   = await _get(f"/albums/{album_id}")
    tracks = [_parse_track(t) for t in data.get("tracks", {}).get("items", [])]
    album  = _parse_album(data)
    album["tracks"] = tracks
    return album


async def get_playlist(playlist_id: str) -> dict:
    data   = await _get(f"/playlists/{playlist_id}")
    tracks = []
    for item in data.get("tracks", {}).get("items", []):
        t = item.get("track")
        if t and t.get("id"):
            tracks.append(_parse_track(t))
    return {
        "id":         data.get("id", ""),
        "title":      data.get("name", ""),
        "artworkUrl": _parse_image(data.get("images", [])),
        "trackCount": data.get("tracks", {}).get("total", 0),
        "tracks":     tracks,
        "source":     "spotify",
    }


async def get_artist(artist_id: str) -> dict:
    artist     = await _get(f"/artists/{artist_id}")
    top_tracks = await _get(f"/artists/{artist_id}/top-tracks?market=US")
    albums_raw = await _get(f"/artists/{artist_id}/albums?limit=10&include_groups=album,single")

    tracks = [_parse_track(t) for t in top_tracks.get("tracks", [])]
    albums = [_parse_album(a) for a in albums_raw.get("items", [])]

    return {
        **_parse_artist(artist),
        "topTracks": tracks,
        "albums":    albums,
    }


async def track_to_search_query(spotify_url: str) -> str:
    """Convert a Spotify track URL to a 'title artist' search string for yt-dlp."""
    kind = detect_spotify_type(spotify_url)
    if kind != "track":
        return ""
    sid   = extract_spotify_id(spotify_url, "track")
    if not sid:
        return ""
    track = await get_track(sid)
    return f"{track['title']} {track['artist']['name']}"