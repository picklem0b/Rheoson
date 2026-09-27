"""Spotify links in → YouTube audio out.

Rheoson never plays Spotify audio — DRM, and the terms, say no. What a
Spotify share link is good for is *identity*: the embed page serves name,
artists, duration and cover art for tracks, albums, playlists and artists
without credentials, and every one of those titles is findable on YouTube.

So the contract is:

* **parse** a share URL (open.spotify.com and spotify.link shorts) into
  ``(kind, id)`` — pure string work, no network, always safe to try.
* **resolve** the metadata from ``open.spotify.com/embed/<kind>/<id>`` —
  one HTTP GET, no token, no SDK. Playlists come back with up to 50 tracks,
  artists with their top 10.
* **match** each track to a YouTube videoId — one ``yt-dlp`` search per
  track, capped, and cached forever in ``.spotify_map.sqlite``: a matched
  track is a *fact* about a recording, and facts do not expire.

Everything returns the engine's own Track shape, so the whole downstream
muscle — stream, relay, download queue, identity, library — works on a
Spotify-imported track unchanged.
"""

from __future__ import annotations

import json
import re
import sqlite3
import threading
import time
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import httpx
import structlog

from app.core import settings as engine_settings, toolchain
from app.services import search as search_service

log = structlog.get_logger()

# ── URL parsing ────────────────────────────────────────────────

KINDS = ("track", "album", "playlist", "artist")

#: ``open.spotify.com/<kind>/<id>`` — also matches the ``/intl-xx/`` locale
#: segment Spotify inserts on regional share links.
PATH_RE = re.compile(r"^/(?:intl-[a-z]{2}/)?(track|album|playlist|artist)/([A-Za-z0-9]{16,30})")

#: ``spotify:track:<id>`` — the URI form arrives from the share sheet too.
URI_RE = re.compile(r"^spotify:(track|album|playlist|artist):([A-Za-z0-9]{16,30})$")

#: ``spotify.link/<code>`` — opaque short links; the id is behind a redirect.
SHORT_HOSTS = ("spotify.link", "spoti.fi")

MAX_ID_LEN = 40


def parse_link(text: str) -> Optional[tuple[str, str]]:
    """A share link in, ``(kind, id)`` out. ``None`` for anything that is not
    a Spotify link — the caller answers "unsupported URL" from that."""
    raw = (text or "").strip()
    if not raw or len(raw) > 2048:
        return None

    if raw.startswith("spotify:"):
        m = URI_RE.match(raw)
        return (m.group(1), m.group(2)) if m else None

    parsed = urlparse(raw if "://" in raw else f"https://{raw}")
    host = (parsed.hostname or "").lower().removeprefix("www.")

    if host in SHORT_HOSTS:
        # The code is the first non-empty path segment; the truth is behind
        # the redirect, which _follow_short resolves when the link is used.
        code = parsed.path.strip("/").split("/")[0] if parsed.path else ""
        return ("short", code) if code and len(code) <= MAX_ID_LEN else None

    if host in ("open.spotify.com", "play.spotify.com"):
        m = PATH_RE.match(parsed.path or "")
        return (m.group(1), m.group(2)) if m else None

    return None


# ── Match cache ────────────────────────────────────────────────

_lock = threading.RLock()
_conn: Optional[sqlite3.Connection] = None
_schema_ready = False


def db_path() -> Path:
    return Path(engine_settings.load().data_dir) / ".spotify_map.sqlite"


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path()), timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def init() -> None:
    """Create the cache table if absent. Never raises."""
    global _schema_ready
    try:
        db_path().parent.mkdir(parents=True, exist_ok=True)
        with _connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS spotify_map (
                    spotify_id TEXT PRIMARY KEY,
                    video_id   TEXT NOT NULL,
                    title      TEXT NOT NULL DEFAULT '',
                    artist     TEXT NOT NULL DEFAULT '',
                    matched_at INTEGER NOT NULL DEFAULT 0
                )
                """
            )
        _schema_ready = True
    except Exception as e:  # noqa: BLE001 — degraded, not fatal
        log.warning("spotify.init.failed", error=str(e))


def _ensure_schema() -> sqlite3.Connection:
    """One connection, schema guaranteed. A read-only data dir returns a
    connection anyway — matching just degrades to searching every time."""
    global _conn, _schema_ready
    with _lock:
        if _conn is None:
            _conn = _connect()
        if not _schema_ready:
            try:
                _conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS spotify_map (
                        spotify_id TEXT PRIMARY KEY,
                        video_id   TEXT NOT NULL,
                        title      TEXT NOT NULL DEFAULT '',
                        artist     TEXT NOT NULL DEFAULT '',
                        matched_at INTEGER NOT NULL DEFAULT 0
                    )
                    """
                )
                _schema_ready = True
            except Exception as e:  # noqa: BLE001
                log.warning("spotify.schema.failed", error=str(e))
        return _conn


def cached_video_ids(spotify_ids: list[str]) -> dict[str, str]:
    """spotify_id → video_id for every known match. Unknown ids are simply
    absent — that is what makes this a cache and not a gate."""
    wanted = [s for s in spotify_ids if s]
    if not wanted:
        return {}
    try:
        conn = _ensure_schema()
        marks = ",".join("?" for _ in wanted)
        rows = conn.execute(
            f"SELECT spotify_id, video_id FROM spotify_map WHERE spotify_id IN ({marks})",  # noqa: S608
            wanted,
        ).fetchall()
        return {row["spotify_id"]: row["video_id"] for row in rows}
    except Exception as e:  # noqa: BLE001
        log.warning("spotify.cache_read.failed", error=str(e))
        return {}


def remember_match(spotify_id: str, video_id: str, title: str, artist: str) -> None:
    """Record one match. Never raises: losing a cache write costs one
    re-search later, crashing the import costs the whole batch."""
    try:
        conn = _ensure_schema()
        with conn:
            conn.execute(
                """
                INSERT INTO spotify_map (spotify_id, video_id, title, artist, matched_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(spotify_id) DO UPDATE SET
                    video_id = excluded.video_id,
                    title = excluded.title,
                    artist = excluded.artist,
                    matched_at = excluded.matched_at
                """,
                (spotify_id, video_id, title, artist, int(time.time())),
            )
    except Exception as e:  # noqa: BLE001
        log.warning("spotify.cache_write.failed", error=str(e))


# ── Embed payload ──────────────────────────────────────────────

_EMBED_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

_NEXT_DATA_RE = re.compile(
    r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', re.DOTALL
)

EMBED_TIMEOUT = 10.0


class SpotifyError(Exception):
    """A failure that maps to one registered DCCNN code."""

    def __init__(self, code: str, status: int = 400, detail: str | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.status = status
        self.detail = detail


def _follow_short(code: str, client: httpx.Client) -> tuple[str, str]:
    """spotify.link code → (kind, id). The short link 302s to an
    open.spotify.com URL (or an interstitial that contains one)."""
    try:
        # No redirect following: the Location header IS the answer when it
        # comes; an HTML interstitial is searched as a fallback.
        res = client.get(f"https://spotify.link/{code}", follow_redirects=False)
        location = res.headers.get("location", "")
        candidates = [location] if location else []
        if not candidates and "text/html" in res.headers.get("content-type", ""):
            candidates = re.findall(r'https://open\.spotify\.com/[^"\'\s\\]+', res.text)
        for candidate in candidates:
            parsed = parse_link(candidate)
            if parsed and parsed[0] in KINDS:
                return parsed
    except Exception as e:  # noqa: BLE001
        log.info("spotify.short_follow.failed", error=str(e))
    raise SpotifyError("RVA02", 400, "The Spotify short link could not be resolved")


def _cover_url(entity: dict) -> Optional[str]:
    """The largest image URL on the entity. Live payloads put it in
    ``visualIdentity.image[]``; older shapes used ``coverArt.sources[]``."""
    images = (entity.get("visualIdentity") or {}).get("image") or []
    sized = [i for i in images if isinstance(i, dict) and i.get("url")]
    if sized:
        best = max(sized, key=lambda i: (i.get("maxWidth") or 0) + (i.get("maxHeight") or 0))
        return best["url"]
    for source in (entity.get("coverArt") or {}).get("sources") or []:
        if isinstance(source, dict) and source.get("url"):
            return source["url"]
    return None


def _entity_track(entity: dict, spotify_id: str) -> dict:
    """One track entity → the metadata dict the matcher consumes."""
    name = entity.get("title") or entity.get("name") or ""
    if not name:
        raise SpotifyError("RUP01", 502, "Spotify track metadata had no title")
    artists = [
        a.get("name")
        for a in entity.get("artists") or []
        if isinstance(a, dict) and a.get("name")
    ]
    duration_ms = entity.get("duration")
    return {
        "spotifyId": spotify_id,
        "title": str(name),
        "artist": ", ".join(artists) or "Unknown Artist",
        "durationMs": duration_ms if isinstance(duration_ms, int) else None,
        "artworkUrl": _cover_url(entity),
    }


def _entity_tracklist(entity: dict) -> list[dict]:
    """The trackList rows, cleaned. Rows can be unplayable (market
    restrictions) — those are skipped rather than matched, because a title
    that cannot be played is not worth a YouTube extraction."""
    out: list[dict] = []
    for row in entity.get("trackList") or []:
        if not isinstance(row, dict):
            continue
        uri = row.get("uri") or ""
        spotify_id = uri.rsplit(":", 1)[-1] if uri.startswith("spotify:track:") else None
        if not spotify_id or not row.get("isPlayable", True):
            continue
        out.append(
            {
                "spotifyId": spotify_id,
                "title": row.get("title") or "",
                "artist": row.get("subtitle") or "Unknown Artist",
                "durationMs": row.get("duration") if isinstance(row.get("duration"), int) else None,
                "artworkUrl": _cover_url(entity),
            }
        )
    return out


# ── Matching ───────────────────────────────────────────────────

#: The query that has proven best at landing on the official recording:
#: the exact title and artist, nothing else — no lyrics fragments, no
#: "official audio" guesses; YouTube search ranks that anyway.
def _query_for(track: dict) -> str:
    return f"{track['title']} {track['artist']}"[:180]


def _match_one(track: dict) -> Optional[str]:
    """One YouTube search, first videoId wins. ``None`` when the tool is
    missing or the search comes back empty — the caller answers honestly."""
    results = search_service.search_remote(_query_for(track), limit=1)
    return results[0]["videoId"] if results else None


def match_tracks(tracks: list[dict]) -> list[dict]:
    """Attach ``videoId`` (or ``matchError``) to every track, then annotate
    ``isDownloaded`` from the identity map — a match that is already on disk
    must not present itself as a stream-only track.

    Cache first, YouTube second — one extraction per *new* track, and a
    re-import of the same playlist costs zero network calls.
    """
    if not tracks:
        return []
    known = cached_video_ids([t["spotifyId"] for t in tracks])
    for track in tracks:
        hit = known.get(track["spotifyId"])
        if hit:
            track["videoId"] = hit

    unmatched = [t for t in tracks if not t.get("videoId")]
    if unmatched and toolchain.ytdlp().available:
        for track in unmatched:
            video_id = _match_one(track)
            if video_id:
                track["videoId"] = video_id
                remember_match(track["spotifyId"], video_id, track["title"], track["artist"])
            else:
                track["matchError"] = "RNF01"
    elif unmatched:
        for track in unmatched:
            track["matchError"] = "DEN02"

    from app.services import identity

    for track in tracks:
        if track.get("videoId"):
            track["isDownloaded"] = identity.lookup_by_video(track["videoId"]) is not None
    return tracks


# ── Surfaces ───────────────────────────────────────────────────

MAX_BATCH = 50


def resolve_link(text: str, *, match: bool = True) -> dict:
    """One share link in, the engine's Track shape out.

    A track resolves to ``{kind: 'track', track: <Track>}``; everything else
    resolves to ``{kind, title, subtitle, artworkUrl, tracks: [...]}`` with
    the same Track dicts — the client renders one list either way.
    """
    parsed = parse_link(text)
    if not parsed or (parsed[0] not in KINDS and parsed[0] != "short"):
        raise SpotifyError("RVA02", 400)

    kind, spotify_id = parsed

    with httpx.Client(
        timeout=EMBED_TIMEOUT, follow_redirects=True, headers={"User-Agent": _EMBED_UA}
    ) as client:
        if kind == "short":
            kind, spotify_id = _follow_short(spotify_id, client)
        if kind == "track":
            entity = _fetch_via(kind, spotify_id, client)
            meta = _entity_track(entity, spotify_id)
            (matched,) = match_tracks([meta]) if match else [meta]
            return {"kind": "track", "track": _to_track(matched)}

        entity = _fetch_via(kind, spotify_id, client)

    name = entity.get("name") or entity.get("title") or "Unknown"
    subtitle = entity.get("subtitle") or ""
    rows = _entity_tracklist(entity)[:MAX_BATCH]
    if not rows:
        raise SpotifyError("PUP01", 422, f"That Spotify {kind} has no playable tracks")

    tracks = match_tracks(rows)
    return {
        "kind": kind,
        "title": str(name),
        "subtitle": str(subtitle),
        "artworkUrl": _cover_url(entity),
        "tracks": [_to_track(t) for t in tracks],
    }


def _fetch_via(kind: str, spotify_id: str, client: httpx.Client) -> dict:
    """The embed page's __NEXT_DATA__ entity, parsed. Spotify's app-facing
    surface — no credentials, no SDK, one GET on a shared client (the
    short-link path already holds one)."""
    if kind not in KINDS:
        raise SpotifyError("RVA02", 400)
    url = f"https://open.spotify.com/embed/{kind}/{spotify_id}"
    try:
        res = client.get(url)
    except Exception as e:  # noqa: BLE001
        raise SpotifyError("RUP01", 503, f"Spotify embed unreachable: {e}") from e
    if res.status_code == 404:
        raise SpotifyError("TNF01", 404, f"No Spotify {kind} with that id")
    if res.status_code != 200:
        raise SpotifyError("RUP01", 502, f"Spotify embed answered {res.status_code}")
    m = _NEXT_DATA_RE.search(res.text)
    if not m:
        raise SpotifyError("RUP01", 502, "Spotify embed returned no metadata payload")
    try:
        data = json.loads(m.group(1))
    except json.JSONDecodeError as e:
        raise SpotifyError("RUP01", 502, "Spotify embed metadata was unreadable") from e
    entity = (
        data.get("props", {}).get("pageProps", {}).get("state", {}).get("data", {}).get("entity")
    )
    if not isinstance(entity, dict):
        raise SpotifyError("RUP01", 502, "Spotify embed metadata had no entity")
    return entity


def _to_track(meta: dict) -> dict:
    """The engine Track shape — the same dict every other surface returns."""
    video_id = meta.get("videoId")
    artist = meta.get("artist") or "Unknown Artist"
    duration_s = (meta.get("durationMs") or 0) / 1000
    track: dict = {
        "id": video_id,
        "videoId": video_id,
        "title": meta.get("title") or "Unknown Title",
        "artist": {"id": artist, "name": artist},
        "album": {"id": "Unknown Album", "title": "Unknown Album"},
        "duration": round(duration_s, 1) if duration_s else None,
        "artworkUrl": meta.get("artworkUrl"),
        "source": "youtube",
        "isDownloaded": bool(meta.get("isDownloaded", False)),
    }
    if not video_id:
        # An unmatched track stays honest: it exists in Spotify's world but
        # has no YouTube identity yet, so the client can say exactly that.
        track["id"] = f"spotify:{meta.get('spotifyId')}"
        track["unmatched"] = True
    return track
