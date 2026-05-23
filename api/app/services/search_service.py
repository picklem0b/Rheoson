from __future__ import annotations
import re
import structlog
from pathlib import Path
from app.core.config import settings
from app.core.exceptions import SearchError, UnsupportedURLError
from app.services import ytmusic_service, spotify_service
from app.services.metadata_service import read_track_metadata

log = structlog.get_logger()

def safe_str(v, fallback=""):
    if v is None:
        return fallback
    return str(v)

# ── URL detection ─────────────────────────────────────────────
_YOUTUBE_RE  = re.compile(r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/shorts/)')
_SPOTIFY_RE  = re.compile(r'open\.spotify\.com/')

# Any URL yt-dlp can handle beyond YouTube/Spotify
_YTDLP_HOSTS = re.compile(
    r'(?:soundcloud\.com|bandcamp\.com|deezer\.com|tidal\.com|'
    r'music\.apple\.com|vimeo\.com|twitch\.tv|mixcloud\.com|'
    r'audiomack\.com|reverbnation\.com)'
)


def _is_url(s: str) -> bool:
    return s.strip().startswith(("http://", "https://"))


def _detect_url_type(url: str) -> str:
    """Returns 'youtube' | 'spotify' | 'ytdlp' | 'unknown'."""
    if _YOUTUBE_RE.search(url):  return "youtube"
    if _SPOTIFY_RE.search(url):  return "spotify"
    if _YTDLP_HOSTS.search(url): return "ytdlp"
    if _is_url(url):              return "ytdlp"   # try yt-dlp on any URL
    return "unknown"


# ── Main search entry point ───────────────────────────────────

async def search(query: str, filter: str | None = None) -> dict:
    """
    Smart search:
    - Spotify URL  → resolve via Spotify API, match on YouTube Music
    - YouTube URL  → resolve via ytmusicapi
    - Any other URL→ pass to yt-dlp info extraction
    - Plain text   → search YouTube Music
    """
    q = query.strip()

    if _is_url(q):
        return await resolve_url(q)

    # Plain text search
    results = await ytmusic_service.search(q, filter=filter)

    # Also search local library and merge
    local = _search_local(q)
    if local:
        results["tracks"] = local + results["tracks"]

    return results


async def resolve_url(url: str) -> dict:
    """Resolve any supported URL to tracks/album/playlist/artist."""
    kind = _detect_url_type(url)

    if kind == "spotify":
        return await _resolve_spotify(url)

    if kind == "youtube":
        track = await ytmusic_service.resolve_youtube_url(url)
        return {
            "query":     url,
            "tracks":    [track] if track else [],
            "albums":    [],
            "artists":   [],
            "playlists": [],
        }

    if kind == "ytdlp":
        return await _resolve_ytdlp(url)

    raise UnsupportedURLError(url)


async def _resolve_spotify(url: str) -> dict:
    sp_type = spotify_service.detect_spotify_type(url)
    if not sp_type:
        raise UnsupportedURLError(url)

    sid = spotify_service.extract_spotify_id(url, sp_type)
    if not sid:
        raise UnsupportedURLError(url)

    log.info("search.spotify.resolve", type=sp_type, id=sid)

    if sp_type == "track":
        sp_track = await spotify_service.get_track(sid)
        # Find the best YouTube Music match
        query    = f"{sp_track['title']} {sp_track['artist']['name']}"
        yt_track = await ytmusic_service.search_one(query)

        # Merge Spotify metadata (better artwork) into YouTube track
        if yt_track:
            yt_track["artworkUrl"]         = sp_track.get("artworkUrl") or yt_track["artworkUrl"]
            yt_track["spotifyId"]          = sp_track.get("spotifyId")
            yt_track["duration"]           = sp_track.get("duration")   or yt_track["duration"]
            yt_track["album"]["artworkUrl"]= sp_track.get("artworkUrl") or yt_track["album"]["artworkUrl"]

        return {
            "query":     url,
            "type":      "track",
            "tracks":    [yt_track] if yt_track else [],
            "albums":    [],
            "artists":   [],
            "playlists": [],
        }

    if sp_type == "album":
        album  = await spotify_service.get_album(sid)
        tracks = album.pop("tracks", [])
        # Match each track on YouTube Music
        matched = []
        for t in tracks[:30]:   # cap at 30 to avoid hammering ytm
            q  = f"{t['title']} {t['artist']['name']}"
            yt = await ytmusic_service.search_one(q)
            if yt:
                yt["artworkUrl"]  = album.get("artworkUrl") or yt["artworkUrl"]
                yt["spotifyId"]   = t.get("spotifyId")
                matched.append(yt)
        return {
            "query":     url,
            "type":      "album",
            "tracks":    matched,
            "albums":    [album],
            "artists":   [],
            "playlists": [],
        }

    if sp_type == "playlist":
        pl     = await spotify_service.get_playlist(sid)
        tracks = pl.pop("tracks", [])
        matched = []
        for t in tracks[:50]:
            q  = f"{t['title']} {t['artist']['name']}"
            yt = await ytmusic_service.search_one(q)
            if yt:
                yt["artworkUrl"] = t.get("artworkUrl") or yt["artworkUrl"]
                yt["spotifyId"]  = t.get("spotifyId")
                matched.append(yt)
        return {
            "query":     url,
            "type":      "playlist",
            "tracks":    matched,
            "albums":    [],
            "artists":   [],
            "playlists": [pl],
        }

    if sp_type == "artist":
        artist = await spotify_service.get_artist(sid)
        tracks = artist.pop("topTracks", [])
        albums = artist.pop("albums", [])
        matched = []
        for t in tracks[:10]:
            q  = f"{t['title']} {artist['name']}"
            yt = await ytmusic_service.search_one(q)
            if yt:
                yt["artworkUrl"] = t.get("artworkUrl") or yt["artworkUrl"]
                matched.append(yt)
        return {
            "query":   url,
            "type":    "artist",
            "tracks":  matched,
            "albums":  albums,
            "artists": [artist],
            "playlists": [],
        }

    raise UnsupportedURLError(url)


async def _resolve_ytdlp(url: str) -> dict:
    """
    Use yt-dlp's info extractor (no download) to resolve any URL.
    Works for SoundCloud, Bandcamp, Deezer, Apple Music, etc.
    """
    import asyncio
    import yt_dlp

    loop = asyncio.get_event_loop()

    def _extract():
        ydl_opts = {
            "quiet":          True,
            "no_warnings":    True,
            "extract_flat":   "in_playlist",
            "skip_download":  True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            return ydl.extract_info(url, download=False)

    try:
        info = await loop.run_in_executor(None, _extract)
    except Exception as e:
        log.error("search.ytdlp.resolve.failed", url=url, error=str(e))
        raise UnsupportedURLError(url)

    if not info:
        raise UnsupportedURLError(url)

    tracks = []

    # Playlist / collection
    if info.get("_type") == "playlist":
        for entry in (info.get("entries") or [])[:50]:
            if not entry:
                continue
            vid_id = entry.get("id", "")
            thumb  = ""
            thumbs = entry.get("thumbnails") or []
            if thumbs:
                thumb = thumbs[-1].get("url", "")

            tracks.append({
                "id":           vid_id,
                "title":        entry.get("title", "Unknown"),
                "duration":     float(entry.get("duration") or 0),
                "artworkUrl":   thumb,
                "youtubeId":    vid_id,
                "spotifyId":    None,
                "isDownloaded": False,
                "isLiked":      False,
                "streamUrl":    f"/api/stream/{vid_id}/audio",
                "artist": {
                    "id":       entry.get("channel_id", ""),
                    "name":     entry.get("uploader") or entry.get("channel") or "Unknown",
                    "imageUrl": None,
                    "genres":   [],
                },
                "album": {
                    "id":          info.get("id", ""),
                    "title":       info.get("title", ""),
                    "artworkUrl":  thumb,
                    "releaseYear": 0,
                    "trackCount":  len(info.get("entries") or []),
                    "artist": {
                        "id":       "",
                        "name":     info.get("uploader", ""),
                        "imageUrl": None,
                        "genres":   [],
                    },
                },
            })
    else:
        # Single track
        vid_id = info.get("id", "")
        thumbs = info.get("thumbnails") or []
        thumb  = thumbs[-1].get("url", "") if thumbs else ""

        tracks.append({
            "id":           vid_id,
            "title":        info.get("title", "Unknown"),
            "duration":     float(info.get("duration") or 0),
            "artworkUrl":   thumb,
            "youtubeId":    vid_id,
            "spotifyId":    None,
            "isDownloaded": False,
            "isLiked":      False,
            "streamUrl":    f"/api/stream/{vid_id}/audio",
            "artist": {
                "id":       info.get("channel_id", ""),
                "name":     info.get("uploader") or info.get("channel") or "Unknown",
                "imageUrl": None,
                "genres":   [],
            },
            "album": {
                "id":          "",
                "title":       info.get("album") or "",
                "artworkUrl":  thumb,
                "releaseYear": int(info.get("release_year") or 0),
                "trackCount":  0,
                "artist": {
                    "id":       info.get("channel_id", ""),
                    "name":     info.get("uploader") or "",
                    "imageUrl": None,
                    "genres":   [],
                },
            },
        })

    return {
        "query":     url,
        "type":      "playlist" if info.get("_type") == "playlist" else "track",
        "tracks":    tracks,
        "albums":    [],
        "artists":   [],
        "playlists": [],
    }


def _search_local(query: str) -> list[dict]:
    """Search local music library for downloaded tracks."""
    q         = query.lower()
    results   = []
    music_dir = Path(settings.MUSIC_DIR)

    if not music_dir.exists():
        return []

    for path in music_dir.rglob("*"):
        if path.suffix.lstrip(".") in ("mp3", "flac", "m4a", "ogg", "opus", "wav"):
            try:
                track = read_track_metadata(path)
                if (q in track["title"].lower()
                        or q in track["artist"]["name"].lower()
                        or q in track["album"]["title"].lower()):
                    results.append(track)
            except Exception:
                continue

    return results[:10]   # cap local results