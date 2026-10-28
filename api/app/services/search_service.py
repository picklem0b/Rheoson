from __future__ import annotations
import re
import asyncio
import unicodedata
import structlog
from pathlib import Path
from app.core.config import settings
from app.core.exceptions import UnsupportedURLError
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

def _is_url(text: str) -> bool:
    return bool(re.match(r"^https?://", text.strip(), re.IGNORECASE))


def _detect_url_type(url: str) -> str:
    if _YOUTUBE_RE.search(url):  return "youtube"
    if _SPOTIFY_RE.search(url):  return "spotify"
    if _YTDLP_HOSTS.search(url): return "ytdlp"
    # Deliberately NOT a catch-all: an arbitrary http(s) URL must not be
    # handed to yt-dlp (SSRF). Unknown hosts → "unknown" → 400.
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


def _finalize(tracks: list[dict]) -> None:
    """Post-process search results: mark already-downloaded tracks (stable
    identity bridge) then prewarm the stream cache for the rest."""
    try:
        from app.services import track_identity
        track_identity.mark_downloaded(tracks)
    except Exception:
        pass
    _schedule_prewarm(tracks)

# ── Main search ───────────────────────────────────────────────

async def search(query: str, filter: str | None = None) -> dict:
    q = query.strip()
    if _is_url(q):
        return await resolve_url(q)
    results = await ytmusic_service.search(q, filter=filter)
    local   = _search_local(q)
    if local:
        results["tracks"] = local + results["tracks"]
    _finalize(results["tracks"])
    return results

async def resolve_url(url: str) -> dict:
    # Defense in depth: allowlist + public-IP check before any fetch/extract
    try:
        from app.services.netguard import ensure_safe_media_url
        ensure_safe_media_url(url)
    except ValueError:
        raise UnsupportedURLError(url)

    kind = _detect_url_type(url)

    if kind == "spotify":
        # yt-dlp has no Spotify extractor, so the old "fall back to yt-dlp"
        # branch could only ever fail with an extractor error. Say what is
        # actually missing instead: the credentials that read the link.
        if not settings.has_spotify:
            from app.core.exceptions import SpotifyError
            raise SpotifyError(
                "Spotify links need a Client ID and Secret — add them in Settings → Account"
            )
        return await _resolve_spotify(url)

    if kind == "youtube":
        track  = await ytmusic_service.resolve_youtube_url(url)
        result = {"query": url, "tracks": [track] if track else [], "albums": [], "artists": [], "playlists": []}
        _finalize(result["tracks"])
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
        matched, unmatched = await _match_tracks_concurrent([sp_track])
        return _collection_result(
            url, "track", matched, unmatched,
            total=1, skipped=0, extra={"playlists": [], "albums": []},
        )

    if sp_type == "album":
        album = await spotify_service.get_album(sid)
        tracks = album.pop("tracks", [])
        skipped = int(album.pop("skipped", 0) or 0)
        matched, unmatched = await _match_tracks_concurrent(
            tracks, album.get("artworkUrl")
        )
        album["trackCount"] = len(tracks)
        return _collection_result(
            url, "album", matched, unmatched,
            total=len(tracks) + skipped, skipped=skipped,
            extra={"albums": [album], "playlists": []},
        )

    if sp_type == "playlist":
        pl = await spotify_service.get_playlist(sid)
        tracks = pl.pop("tracks", [])
        skipped_map = pl.pop("skipped", {}) or {}
        skipped = sum(v for v in skipped_map.values() if isinstance(v, int))
        matched, unmatched = await _match_tracks_concurrent(tracks)
        pl["trackCount"] = len(tracks) + skipped
        return _collection_result(
            url, "playlist", matched, unmatched,
            total=len(tracks) + skipped, skipped=skipped,
            extra={"playlists": [pl], "albums": []},
        )

    if sp_type == "artist":
        artist = await spotify_service.get_artist(sid)
        tracks = artist.pop("topTracks", [])
        albums = artist.pop("albums", [])
        matched, unmatched = await _match_tracks_concurrent(tracks)
        return _collection_result(
            url, "artist", matched, unmatched,
            total=len(tracks), skipped=0,
            extra={"artists": [artist], "albums": albums, "playlists": []},
        )

    raise UnsupportedURLError(url)


def _collection_result(
    url: str,
    kind: str,
    matched: list[dict],
    unmatched: list[dict],
    *,
    total: int,
    skipped: int,
    extra: dict,
) -> dict:
    """One shape for every Spotify link, so the UI never has to guess.

    `total` is what the link contains, `matched` is what YouTube Music could
    be trusted with, and `unmatched` names the rest with a reason — a playlist
    that silently arrives 20 tracks short is worse than one that says so.
    """
    result = {
        "query": url,
        "type": kind,
        "tracks": matched,
        "albums": extra.get("albums", []),
        "artists": extra.get("artists", []),
        "playlists": extra.get("playlists", []),
        "total": total,
        "matched": len(matched),
        "skipped": skipped,
        "unmatched": unmatched,
    }
    _finalize(result["tracks"])
    return result


# ── Spotify matching ──────────────────────────────────────────
#
# A playlist import is a matching problem, not a search one. The first result
# for "Title Artist" is regularly a live take, a medley, a karaoke version or
# a cover, and every one of those that slips through is a wrong file in the
# user's library that they only notice weeks later. So: compare the five best
# candidates, score title + artist + duration, and refuse anything that does
# not clear the floor.

_MATCH_FLOOR = 0.70
_SKIP_WORDS = {
    "the", "a", "an", "and", "with", "feat", "ft", "featuring",
    "official", "video", "audio", "lyric", "lyrics", "hd", "hq",
    "remaster", "remastered", "version", "edit", "explicit", "new",
}
_BRACKETED = re.compile(r"[\(\[\{][^\)\]\}]*[\)\]\}]")


def _norm(value: str) -> str:
    """Lowercase, unaccented, punctuation-free, version tags removed."""
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = _BRACKETED.sub(" ", text.lower())
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return " ".join(text.split())


def _tokens(value: str) -> set[str]:
    return {w for w in _norm(value).split() if w and w not in _SKIP_WORDS}


def _text_score(want: str, got: str) -> float:
    a, b = _norm(want), _norm(got)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    ta, tb = _tokens(want), _tokens(got)
    if not ta or not tb:
        return 0.0
    if ta <= tb or tb <= ta:
        return 0.9
    return len(ta & tb) / len(ta | tb)


def _score_candidate(candidate: dict, want: dict) -> float:
    title = _text_score(want.get("title", ""), candidate.get("title", ""))
    artist = _text_score(
        (want.get("artist") or {}).get("name", ""),
        (candidate.get("artist") or {}).get("name", ""),
    )
    score = 0.72 * title + 0.28 * artist

    # Right title, wrong act is a cover; never let it clear the floor on
    # title alone.
    if artist < 0.5:
        score = min(score, _MATCH_FLOOR - 0.02)

    want_d, got_d = float(want.get("duration") or 0), float(candidate.get("duration") or 0)
    if want_d and got_d:
        if abs(want_d - got_d) > max(20.0, want_d * 0.2):
            score *= 0.75
        # A candidate several times longer is a full album or a looped upload.
        if got_d > want_d * 1.8 + 30:
            score *= 0.5
    return round(score, 3)


async def _match_tracks_concurrent(
    tracks: list[dict],
    album_artwork: str | None = None,
    concurrency: int = 4,
) -> tuple[list[dict], list[dict]]:
    """Match Spotify tracks to YouTube Music, in order, with the failures."""
    sem = asyncio.Semaphore(concurrency)

    async def _match(t: dict) -> tuple[dict | None, dict | None]:
        title = t.get("title", "")
        artist = (t.get("artist") or {}).get("name", "")
        query = f"{title} {artist}".strip()
        async with sem:
            try:
                candidates = await ytmusic_service.search_candidates(query, limit=5)
            except Exception as e:
                log.warning("search.spotify.match.failed", query=query, error=str(e))
                return None, {
                    "title": title, "artist": artist,
                    "spotifyId": t.get("spotifyId"),
                    "reason": "YouTube Music search failed",
                }

        best, best_score = None, 0.0
        for candidate in candidates:
            score = _score_candidate(candidate, t)
            if score > best_score:
                best, best_score = candidate, score

        if best is None or best_score < _MATCH_FLOOR:
            return None, {
                "title": title, "artist": artist,
                "spotifyId": t.get("spotifyId"),
                "reason": "no close match on YouTube Music",
                "score": best_score,
            }

        best["artworkUrl"] = album_artwork or t.get("artworkUrl") or best.get("artworkUrl")
        best["spotifyId"] = t.get("spotifyId")
        best["matchScore"] = best_score
        return best, None

    results = await asyncio.gather(*[_match(t) for t in tracks], return_exceptions=True)
    matched: list[dict] = []
    unmatched: list[dict] = []
    for r in results:
        if isinstance(r, Exception):
            unmatched.append({"title": "", "artist": "", "reason": "matching failed"})
            continue
        ok, bad = r
        if ok:
            matched.append(ok)
        elif bad:
            unmatched.append(bad)
    return matched, unmatched

# ── yt-dlp URL ────────────────────────────────────────────────

async def _resolve_ytdlp(url: str) -> dict:
    import yt_dlp
    loop = asyncio.get_event_loop()
    def _extract():
        # yt-dlp otherwise follows redirects to wherever the remote wants;
        # bound it so a hostile response cannot bounce us into a private net.
        with yt_dlp.YoutubeDL({
            "quiet": True,
            "no_warnings": True,
            "extract_flat": "in_playlist",
            "skip_download": True,
            "max_redirects": 3,
            "socket_timeout": 15,
        }) as ydl:
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
    _finalize(result["tracks"])
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