"""Spotify metadata, read the way a playlist actually is: all of it.

The client-credentials flow is enough for any *public* track, album, playlist
or artist, which is exactly what a pasted link points at. What it is not is a
way to get audio — Spotify streams are DRM-protected and there is no extractor
for them — so this module's job ends at metadata and the matcher in
`search_service` takes the titles to YouTube Music.

Two things here are load-bearing and were wrong before:

* **Paging.** `/playlists/{id}` and `/albums/{id}` answer with one page (100
  and 50 items) plus a `next` URL. Reading only `tracks.items` silently cut a
  playlist off at its first page — and the caller cut it again at 50. A
  playlist is only useful if it is the whole playlist, so every collection is
  followed to the end of its `next` chain here, once, with a cap that exists
  to stop a runaway loop rather than to trim a real library.
* **What "missing" means.** A playlist item can be a local file, a podcast
  episode, or a track that has since been removed from Spotify (`track: null`).
  None of those can be matched or downloaded, so they are counted and reported
  instead of quietly disappearing from the count the UI shows.
"""

from __future__ import annotations

import asyncio
import re
import time
from typing import Any, Optional

import httpx
import structlog

from app.core.config import settings
from app.core.exceptions import SpotifyError

log = structlog.get_logger()

# ── URL patterns ──────────────────────────────────────────────
# `intl-xx` paths are what the desktop/web app shares from some regions
# (`open.spotify.com/intl-de/track/…`); the old patterns missed those entirely.
_TRACK_RE    = re.compile(r'open\.spotify\.com/(?:intl-[a-z]{2}/)?track/([A-Za-z0-9]+)')
_ALBUM_RE    = re.compile(r'open\.spotify\.com/(?:intl-[a-z]{2}/)?album/([A-Za-z0-9]+)')
_PLAYLIST_RE = re.compile(r'open\.spotify\.com/(?:intl-[a-z]{2}/)?playlist/([A-Za-z0-9]+)')
_ARTIST_RE   = re.compile(r'open\.spotify\.com/(?:intl-[a-z]{2}/)?artist/([A-Za-z0-9]+)')

# A playlist bigger than this is a mistake or an attack, not a library. The
# cap bounds the number of API calls and the work the matcher is asked to do.
MAX_COLLECTION_ITEMS = 2_000
# One artist can have hundreds of releases; the preview only needs a page of
# them to offer, and a download of "an artist" is their top tracks.
MAX_ARTIST_ALBUMS = 100

_API = "https://api.spotify.com/v1"
_TOKEN_URL = "https://accounts.spotify.com/api/token"
_TIMEOUT = httpx.Timeout(15.0, connect=10.0)

_token: str = ""
_token_expires_at: float = 0.0
_token_lock: asyncio.Lock | None = None


def _lock() -> asyncio.Lock:
    """One lock per running loop.

    A module-level `asyncio.Lock()` binds to whatever loop first awaited it,
    which breaks every test that spins up its own loop (and any embedder that
    does the same). Creating it on demand keeps that from being a trap.
    """
    global _token_lock
    if _token_lock is None:
        _token_lock = asyncio.Lock()
    return _token_lock


def _reset_caches() -> None:
    """Test hook: forget the token and the lock."""
    global _token, _token_expires_at, _token_lock
    _token = ""
    _token_expires_at = 0.0
    _token_lock = None


async def _get_token() -> str:
    """Fetch (and cache) a client-credentials token."""
    global _token, _token_expires_at

    if not settings.has_spotify:
        raise SpotifyError(
            "Spotify credentials are not configured — paste a Client ID and "
            "Secret in Settings → Account"
        )

    # Refreshed 60 s before expiry, so a request never races the clock.
    if _token and time.monotonic() < _token_expires_at - 60:
        return _token

    async with _lock():
        if _token and time.monotonic() < _token_expires_at - 60:
            return _token
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                resp = await client.post(
                    _TOKEN_URL,
                    data={"grant_type": "client_credentials"},
                    auth=(settings.SPOTIFY_CLIENT_ID, settings.SPOTIFY_CLIENT_SECRET),
                )
        except httpx.HTTPError as e:
            raise SpotifyError(f"Could not reach Spotify: {e}") from e

        if resp.status_code != 200:
            log.warning("spotify.token.failed", status=resp.status_code)
            raise SpotifyError(
                f"Spotify rejected the credentials ({resp.status_code}) — check the "
                "Client ID and Secret in Settings → Account"
            )

        try:
            data = resp.json()
        except ValueError as e:
            raise SpotifyError("Spotify returned an unreadable token response") from e

        token = data.get("access_token", "")
        if not token:
            raise SpotifyError("Spotify returned an empty token")

        _token = token
        _token_expires_at = time.monotonic() + float(data.get("expires_in", 3600))
        log.debug("spotify.token.refreshed")
        return _token


async def _request(url: str) -> dict:
    """Authenticated GET with the two retries that matter.

    401 is an expired token (refresh once); 429 is Spotify's rate limiter
    (honour `Retry-After`, bounded). Everything else becomes a `SpotifyError`
    that names the resource rather than leaking httpx internals.
    """
    if url.startswith("/"):
        url = f"{_API}{url}"

    for attempt in (0, 1):
        token = await _get_token()
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                resp = await client.get(url, headers={"Authorization": f"Bearer {token}"})
        except httpx.HTTPError as e:
            raise SpotifyError(f"Could not reach Spotify: {e}") from e

        if resp.status_code == 401 and attempt == 0:
            _reset_token()
            continue

        if resp.status_code == 429 and attempt == 0:
            retry_after = resp.headers.get("Retry-After", "")
            try:
                wait = min(float(retry_after), 5.0)
            except ValueError:
                wait = 1.0
            log.info("spotify.rate_limited", wait=wait)
            await asyncio.sleep(max(wait, 0.5))
            continue

        if resp.status_code in (502, 503, 504) and attempt == 0:
            await asyncio.sleep(0.5)
            continue

        if resp.status_code != 200:
            log.warning("spotify.request.failed", status=resp.status_code, url=url)
            raise _error_for_status(resp.status_code)

        try:
            return resp.json()
        except ValueError as e:
            raise SpotifyError("Spotify returned an unreadable response") from e

    raise SpotifyError("Spotify API error")


def _error_for_status(status: int) -> SpotifyError:
    """One sentence that tells the user what to do about a refusal."""
    if status == 404:
        return SpotifyError("Spotify could not find that link — it may have been deleted")
    if status in (401, 403):
        # Client credentials can only read public playlists; a private one and
        # a revoked token look the same from here, so the sentence covers both.
        return SpotifyError(
            "Spotify refused that link — it is private, or this app's "
            "credentials cannot read it"
        )
    return SpotifyError(f"Spotify API error {status}")


def _reset_token() -> None:
    global _token, _token_expires_at
    _token = ""
    _token_expires_at = 0.0


async def _get(path: str) -> dict:
    return await _request(path)


async def _page_through(first: dict, *, max_items: int = MAX_COLLECTION_ITEMS) -> list[dict]:
    """Follow a Spotify paging object's `next` chain to the end."""
    items: list[dict] = list(first.get("items") or [])
    next_url = first.get("next")
    pages = 1
    while next_url and len(items) < max_items:
        page = await _request(str(next_url))
        items.extend(page.get("items") or [])
        next_url = page.get("next")
        pages += 1
        if pages > 100:  # defensive: a bad `next` loop must not spin forever
            log.warning("spotify.paging.aborted", pages=pages)
            break
    return items[:max_items]


# ── Parsers ───────────────────────────────────────────────────

def _parse_image(images: list[dict] | None) -> str:
    if not images:
        return ""
    return sorted(images, key=lambda x: x.get("width") or 0, reverse=True)[0].get("url", "")


def _release_year(value: Any) -> int:
    if not isinstance(value, str) or len(value) < 4:
        return 0
    try:
        return int(value[:4])
    except ValueError:
        return 0


def _parse_artist(a: dict) -> dict:
    return {
        "id":       a.get("id", ""),
        "name":     a.get("name", ""),
        "imageUrl": _parse_image(a.get("images")),
        "genres":   a.get("genres", []) or [],
    }


def _parse_album(al: dict) -> dict:
    artists = al.get("artists") or []
    return {
        "id":          al.get("id", ""),
        "title":       al.get("name", ""),
        "artworkUrl":  _parse_image(al.get("images")),
        "releaseYear": _release_year(al.get("release_date")),
        "trackCount":  al.get("total_tracks", 0) or 0,
        "artist": {
            "id":       artists[0].get("id", "")   if artists else "",
            "name":     artists[0].get("name", "") if artists else "",
            "imageUrl": "",
            "genres":   [],
        },
    }


def _parse_track(t: dict) -> dict:
    album   = t.get("album") or {}
    artists = t.get("artists") or []
    return {
        "id":           t.get("id", ""),
        "title":        t.get("name", ""),
        "duration":     (t.get("duration_ms") or 0) / 1000,
        "artworkUrl":   _parse_image(album.get("images")),
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


def _usable(item: Any) -> tuple[str, dict | None]:
    """Classify one playlist/album item.

    Returns `(state, track)` where state is `"ok"`, `"local"` (a file on
    someone's disk), `"episode"` (a podcast) or `"missing"` (removed, or a
    null entry). Only `"ok"` can be matched against YouTube Music.
    """
    if not isinstance(item, dict):
        return "missing", None
    if item.get("is_local"):
        return "local", None
    track = item.get("track", item)
    if not isinstance(track, dict):
        return "missing", None
    if track.get("type") == "episode":
        return "episode", None
    if not track.get("id"):
        return "missing", None
    return "ok", track


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
    """The whole album, not its first page of 50 tracks."""
    data = await _get(f"/albums/{album_id}")
    tracks = []
    skipped = 0
    for item in await _page_through(data.get("tracks") or {}):
        state, raw = _usable(item)
        if state == "ok" and raw is not None:
            tracks.append(_parse_track(raw))
        else:
            skipped += 1
    album = _parse_album(data)
    album["tracks"] = tracks
    album["skipped"] = skipped
    return album


async def get_playlist(playlist_id: str) -> dict:
    """The whole playlist, across every page Spotify returns."""
    data = await _get(f"/playlists/{playlist_id}")
    first_page = data.get("tracks") or {}
    tracks = []
    skipped = {"local": 0, "episode": 0, "missing": 0}
    for item in await _page_through(first_page):
        state, raw = _usable(item)
        if state == "ok" and raw is not None:
            tracks.append(_parse_track(raw))
        else:
            skipped[state] = skipped.get(state, 0) + 1
    return {
        "id":         data.get("id", ""),
        "title":      data.get("name", ""),
        "artworkUrl": _parse_image(data.get("images")),
        "trackCount": first_page.get("total", 0) or len(tracks),
        "tracks":     tracks,
        "skipped":    skipped,
        "source":     "spotify",
        "owner":      (data.get("owner") or {}).get("display_name", ""),
    }


async def get_artist(artist_id: str) -> dict:
    artist = await _get(f"/artists/{artist_id}")
    top_tracks, albums_raw = await asyncio.gather(
        _get(f"/artists/{artist_id}/top-tracks?market=US"),
        _get(f"/artists/{artist_id}/albums?include_groups=album,single&limit=50"),
    )
    albums = [_parse_album(a) for a in await _page_through(
        albums_raw, max_items=MAX_ARTIST_ALBUMS
    ) if isinstance(a, dict)]
    tracks = [_parse_track(t) for t in (top_tracks.get("tracks") or []) if isinstance(t, dict)]
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
    sid = extract_spotify_id(spotify_url, "track")
    if not sid:
        return ""
    track = await get_track(sid)
    return f"{track['title']} {track['artist']['name']}"
