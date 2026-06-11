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

# ── URL detection ─────────────────────────────────────────────

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


# ── Prewarm cache ─────────────────────────────────────────────
# After a search completes, we pre-resolve the first N track IDs so that
# when the user taps play the stream is ready faster (yt-dlp already has
# its internal URL resolved inside the subprocess).
#
# We don't cache the audio bytes — just fire a lightweight HEAD request
# to the stream endpoint which triggers yt-dlp to resolve the video URL.
# That resolved URL is cached inside yt-dlp's cookie/session state.
#
# Prewarm runs as a background asyncio task and never blocks search results.

_PREWARM_N = 3  # how many tracks to prewarm


async def _prewarm_tracks(track_ids: list[str]) -> None:
    """
    Fire lightweight stream HEAD requests for the first N tracks so that
    yt-dlp has already resolved their URLs by the time the user presses play.
    """
    import aiohttp
    targets = track_ids[:_PREWARM_N]

    async def _head(track_id: str):
        url = f"http://127.0.0.1:{settings.API_PORT}/api/stream/{track_id}/audio"
        try:
            async with aiohttp.ClientSession() as session:
                async with session.head(url, timeout=aiohttp.ClientTimeout(total=8)) as resp:
                    log.debug("search.prewarm.ok", track_id=track_id, status=resp.status)
        except Exception as e:
            log.debug("search.prewarm.skip", track_id=track_id, error=str(e))

    await asyncio.gather(*[_head(tid) for tid in targets], return_exceptions=True)


def _schedule_prewarm(tracks: list[dict]) -> None:
    ids = [t["id"] for t in tracks if t.get("id") and not t.get("isDownloaded")]
    if not ids:
        return
    asyncio.create_task(_prewarm_tracks(ids))
    log.debug("search.prewarm.scheduled", count=min(len(ids), _PREWARM_N))


# ── Main search ───────────────────────────────────────────────

async def search(query: str, filter: str | None = None) -> dict:
    q = query.strip()

    if _is_url(q):
        return await resolve_url(q)

    results = await ytmusic_service.search(q, filter=filter)

    # Merge local library results at the front
    local = _search_local(q)
    if local:
        results["tracks"] = local + results["tracks"]

    # Kick off prewarm in background — doesn't delay the response
    _schedule_prewarm(results["tracks"])

    return results


async def resolve_url(url: str) -> dict:
    kind = _detect_url_type(url)

    if kind == "spotify":
        return await _resolve_spotify(url)
    if kind == "youtube":
        track = await ytmusic_service.resolve_youtube_url(url)
        result = {
            "query":     url,
            "tracks":    [track] if track else [],
            "albums":    [],
            "artists":   [],
            "playlists": [],
        }
        _schedule_prewarm(result["tracks"])
        return result
    if kind == "ytdlp":
        return await _resolve_ytdlp(url)

    raise UnsupportedURLError(url)


# ── Spotify resolution ────────────────────────────────────────

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
        query    = f"{sp_track['title']} {sp_track['artist']['name']}"
        yt_track = await ytmusic_service.search_one(query)

        if yt_track:
            yt_track["artworkUrl"]          = sp_track.get("artworkUrl") or yt_track["artworkUrl"]
            yt_track["spotifyId"]           = sp_track.get("spotifyId")
            yt_track["duration"]            = sp_track.get("duration")   or yt_track["duration"]
            yt_track["album"]["artworkUrl"] = sp_track.get("artworkUrl") or yt_track["album"]["artworkUrl"]

        result = {
            "query":     url,
            "type":      "track",
            "tracks":    [yt_track] if yt_track else [],
            "albums":    [],
            "artists":   [],
            "playlists": [],
        }
        _schedule_prewarm(result["tracks"])
        return result

    if sp_type == "album":
        album  = await spotify_service.get_album(sid)
        tracks = album.pop("tracks", [])
        matched = await _match_tracks_concurrent(tracks[:30], album.get("artworkUrl"))
        result = {
            "query":     url,
            "type":      "album",
            "tracks":    matched,
            "albums":    [album],
            "artists":   [],
            "playlists": [],
        }
        _schedule_prewarm(result["tracks"])
        return result

    if sp_type == "playlist":
        pl     = await spotify_service.get_playlist(sid)
        tracks = pl.pop("tracks", [])
        matched = await _match_tracks_concurrent(tracks[:50])
        result = {
            "query":     url,
            "type":      "playlist",
            "tracks":    matched,
            "albums":    [],
            "artists":   [],
            "playlists": [pl],
        }
        _schedule_prewarm(result["tracks"])
        return result

    if sp_type == "artist":
        artist = await spotify_service.get_artist(sid)
        tracks = artist.pop("topTracks", [])
        albums = artist.pop("albums", [])
        matched = await _match_tracks_concurrent(tracks[:10])
        result = {
            "query":     url,
            "type":      "artist",
            "tracks":    matched,
            "albums":    albums,
            "artists":   [artist],
            "playlists": [],
        }
        _schedule_prewarm(result["tracks"])
        return result

    raise UnsupportedURLError(url)


async def _match_tracks_concurrent(
    tracks: list[dict],
    album_artwork: str | None = None,
    concurrency: int = 5,
) -> list[dict]:
    """
    Match Spotify tracks to YouTube Music concurrently.
    Previously this was sequential — 30 tracks × ~300ms = 9s.
    With concurrency=5 it's ~30/5 × 300ms ≈ 1.8s.
    """
    sem = asyncio.Semaphore(concurrency)

    async def _match(t: dict) -> dict | None:
        async with sem:
            q  = f"{t['title']} {t['artist']['name']}"
            yt = await ytmusic_service.search_one(q)
            if not yt:
                return None
            yt["artworkUrl"] = album_artwork or t.get("artworkUrl") or yt["artworkUrl"]
            yt["spotifyId"]  = t.get("spotifyId")
            return yt

    results = await asyncio.gather(*[_match(t) for t in tracks], return_exceptions=True)
    return [r for r in results if isinstance(r, dict)]


# ── yt-dlp URL resolution ─────────────────────────────────────

async def _resolve_ytdlp(url: str) -> dict:
    import yt_dlp
    loop = asyncio.get_event_loop()

    def _extract():
        ydl_opts = {
            "quiet":         True,
            "no_warnings":   True,
            "extract_flat":  "in_playlist",
            "skip_download": True,
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

    def _make_track(entry: dict, parent: dict) -> dict:
        vid_id = entry.get("id", "")
        thumbs = entry.get("thumbnails") or []
        thumb  = thumbs[-1].get("url", "") if thumbs else ""
        return {
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
                "id":          parent.get("id", ""),
                "title":       parent.get("title", ""),
                "artworkUrl":  thumb,
                "releaseYear": int(entry.get("release_year") or 0),
                "trackCount":  len(parent.get("entries") or []),
                "artist": {
                    "id":       "",
                    "name":     parent.get("uploader", ""),
                    "imageUrl": None,
                    "genres":   [],
                },
            },
        }

    tracks = []
    if info.get("_type") == "playlist":
        for entry in (info.get("entries") or [])[:50]:
            if entry:
                tracks.append(_make_track(entry, info))
    else:
        tracks.append(_make_track(info, {}))

    result = {
        "query":     url,
        "type":      "playlist" if info.get("_type") == "playlist" else "track",
        "tracks":    tracks,
        "albums":    [],
        "artists":   [],
        "playlists": [],
    }
    _schedule_prewarm(result["tracks"])
    return result


# ── Local library search ──────────────────────────────────────

def _search_local(query: str) -> list[dict]:
    q         = query.lower()
    results   = []
    music_dir = Path(settings.MUSIC_DIR)

    if not music_dir.exists():
        return []

    for path in music_dir.rglob("*"):
        if path.suffix.lstrip(".") in {"mp3", "flac", "m4a", "ogg", "opus", "wav"}:
            try:
                track = read_track_metadata(path)
                if (q in track["title"].lower()
                        or q in track["artist"]["name"].lower()
                        or q in track["album"]["title"].lower()):
                    results.append(track)
            except Exception:
                continue

    return results[:10]