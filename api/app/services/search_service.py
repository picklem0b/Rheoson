from __future__ import annotations
import re
import asyncio
import structlog
from pathlib import Path
from app.core.config import settings
from app.core.exceptions import SearchError, UnsupportedURLError
from app.services import ytmusic_service, spotify_service
from app.services.metadata_service import read_track_metadata

log = structlog.get_logger()

_YOUTUBE_RE  = re.compile(r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/shorts/)')
_SPOTIFY_RE  = re.compile(r'open\.spotify\.com/')
_YTDLP_HOSTS = re.compile(
    r'(?:soundcloud\.com|bandcamp\.com|deezer\.com|tidal\.com|'
    r'music\.apple\.com|vimeo\.com|twitch\.tv|mixcloud\.com|'
    r'audiomack\.com|reverbnation\.com)'
)

def _is_url(s: str) -> bool:
    return s.strip().startswith(("http://", "https://"))

def _detect_url_type(url: str) -> str:
    if _YOUTUBE_RE.search(url):  return "youtube"
    if _SPOTIFY_RE.search(url):  return "spotify"
    if _YTDLP_HOSTS.search(url): return "ytdlp"
    if _is_url(url):              return "ytdlp"
    return "unknown"

# ── Prewarm ───────────────────────────────────────────────────

_PREWARM_N = 3

async def _prewarm_tracks(track_ids: list[str]) -> None:
    """Send HEAD requests to warm the stream cache for upcoming tracks."""
    import httpx
    url_template = f"http://127.0.0.1:{settings.API_PORT}/api/stream/{{}}/audio"

    async with httpx.AsyncClient(timeout=8) as client:
        async def _head(track_id: str) -> None:
            try:
                resp = await client.head(url_template.format(track_id))
                log.debug("search.prewarm.ok", track_id=track_id, status=resp.status_code)
            except Exception as e:
                log.debug("search.prewarm.skip", track_id=track_id, error=str(e))

        await asyncio.gather(*[_head(tid) for tid in track_ids], return_exceptions=True)

def _schedule_prewarm(tracks: list[dict]) -> None:
    ids = [t["id"] for t in tracks if t.get("id") and not t.get("isDownloaded")][:_PREWARM_N]
    if not ids:
        return
    asyncio.create_task(_prewarm_tracks(ids))
    log.debug("search.prewarm.scheduled", count=len(ids))

# ── Main search ───────────────────────────────────────────────

async def search(query: str, filter: str | None = None) -> dict:
    q = query.strip()
    if _is_url(q):
        return await resolve_url(q)
    results = await ytmusic_service.search(q, filter=filter)
    local   = _search_local(q)
    if local:
        results["tracks"] = local + results["tracks"]
    _schedule_prewarm(results["tracks"])
    return results

async def resolve_url(url: str) -> dict:
    kind = _detect_url_type(url)

    if kind == "spotify":
        # If Spotify credentials are available, use the Spotify API
        # Otherwise fall back to yt-dlp which can also extract Spotify URLs
        if settings.has_spotify:
            return await _resolve_spotify(url)
        else:
            log.info("search.spotify.fallback_to_ytdlp", url=url)
            return await _resolve_ytdlp(url)

    if kind == "youtube":
        track  = await ytmusic_service.resolve_youtube_url(url)
        result = {"query": url, "tracks": [track] if track else [], "albums": [], "artists": [], "playlists": []}
        _schedule_prewarm(result["tracks"])
        return result

    if kind == "ytdlp":
        return await _resolve_ytdlp(url)

    raise UnsupportedURLError(url)

# ── Spotify ───────────────────────────────────────────────────

async def _resolve_spotify(url: str) -> dict:
    sp_type = spotify_service.detect_spotify_type(url)
    if not sp_type: raise UnsupportedURLError(url)
    sid = spotify_service.extract_spotify_id(url, sp_type)
    if not sid: raise UnsupportedURLError(url)
    log.info("search.spotify.resolve", type=sp_type, id=sid)

    if sp_type == "track":
        sp_track = await spotify_service.get_track(sid)
        query    = f"{sp_track['title']} {sp_track['artist']['name']}"
        yt_track = await ytmusic_service.search_one(query)
        if yt_track:
            yt_track["artworkUrl"]          = sp_track.get("artworkUrl") or yt_track["artworkUrl"]
            yt_track["spotifyId"]           = sp_track.get("spotifyId")
            yt_track["duration"]            = sp_track.get("duration") or yt_track["duration"]
            yt_track["album"]["artworkUrl"] = sp_track.get("artworkUrl") or yt_track["album"]["artworkUrl"]
        result = {"query": url, "type": "track", "tracks": [yt_track] if yt_track else [], "albums": [], "artists": [], "playlists": []}
        _schedule_prewarm(result["tracks"])
        return result

    if sp_type == "album":
        album   = await spotify_service.get_album(sid)
        tracks  = album.pop("tracks", [])
        matched = await _match_tracks_concurrent(tracks[:30], album.get("artworkUrl"))
        result  = {"query": url, "type": "album", "tracks": matched, "albums": [album], "artists": [], "playlists": []}
        _schedule_prewarm(result["tracks"])
        return result

    if sp_type == "playlist":
        pl      = await spotify_service.get_playlist(sid)
        tracks  = pl.pop("tracks", [])
        matched = await _match_tracks_concurrent(tracks[:50])
        result  = {"query": url, "type": "playlist", "tracks": matched, "albums": [], "artists": [], "playlists": [pl]}
        _schedule_prewarm(result["tracks"])
        return result

    if sp_type == "artist":
        artist  = await spotify_service.get_artist(sid)
        tracks  = artist.pop("topTracks", [])
        albums  = artist.pop("albums", [])
        matched = await _match_tracks_concurrent(tracks[:10])
        result  = {"query": url, "type": "artist", "tracks": matched, "albums": albums, "artists": [artist], "playlists": []}
        _schedule_prewarm(result["tracks"])
        return result

    raise UnsupportedURLError(url)

async def _match_tracks_concurrent(
    tracks: list[dict],
    album_artwork: str | None = None,
    concurrency: int = 5,
) -> list[dict]:
    sem = asyncio.Semaphore(concurrency)
    async def _match(t: dict) -> dict | None:
        async with sem:
            q  = f"{t['title']} {t['artist']['name']}"
            yt = await ytmusic_service.search_one(q)
            if not yt: return None
            yt["artworkUrl"] = album_artwork or t.get("artworkUrl") or yt["artworkUrl"]
            yt["spotifyId"]  = t.get("spotifyId")
            return yt
    results = await asyncio.gather(*[_match(t) for t in tracks], return_exceptions=True)
    return [r for r in results if isinstance(r, dict)]

# ── yt-dlp URL ────────────────────────────────────────────────

async def _resolve_ytdlp(url: str) -> dict:
    import yt_dlp
    loop = asyncio.get_event_loop()
    def _extract():
        with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True, "extract_flat": "in_playlist", "skip_download": True}) as ydl:
            return ydl.extract_info(url, download=False)
    try:
        info = await loop.run_in_executor(None, _extract)
    except Exception as e:
        log.error("search.ytdlp.resolve.failed", url=url, error=str(e))
        raise UnsupportedURLError(url)
    if not info: raise UnsupportedURLError(url)

    def _make(entry: dict, parent: dict) -> dict:
        vid   = entry.get("id", "")
        thumb = (entry.get("thumbnails") or [{}])[-1].get("url", "")
        return {
            "id": vid, "title": entry.get("title", "Unknown"),
            "duration": float(entry.get("duration") or 0),
            "artworkUrl": thumb, "youtubeId": vid, "spotifyId": None,
            "isDownloaded": False, "isLiked": False,
            "streamUrl": f"/api/stream/{vid}/audio",
            "artist": {"id": entry.get("channel_id", ""), "name": entry.get("uploader") or "Unknown", "imageUrl": None, "genres": []},
            "album": {"id": parent.get("id", ""), "title": parent.get("title", ""), "artworkUrl": thumb,
                      "releaseYear": 0, "trackCount": 0,
                      "artist": {"id": "", "name": parent.get("uploader", ""), "imageUrl": None, "genres": []}},
        }

    tracks = []
    if info.get("_type") == "playlist":
        for e in (info.get("entries") or [])[:50]:
            if e: tracks.append(_make(e, info))
    else:
        tracks.append(_make(info, {}))

    result = {"query": url, "type": "playlist" if info.get("_type") == "playlist" else "track",
              "tracks": tracks, "albums": [], "artists": [], "playlists": []}
    _schedule_prewarm(result["tracks"])
    return result

# ── Local library ─────────────────────────────────────────────

def _search_local(query: str) -> list[dict]:
    q, results = query.lower(), []
    music_dir  = Path(settings.MUSIC_DIR)
    if not music_dir.exists(): return []
    for path in music_dir.rglob("*"):
        if path.suffix.lstrip(".") in {"mp3", "flac", "m4a", "ogg", "opus", "wav"}:
            try:
                t = read_track_metadata(path)
                if q in t["title"].lower() or q in t["artist"]["name"].lower() or q in t["album"]["title"].lower():
                    results.append(t)
            except Exception:
                continue
    return results[:10]