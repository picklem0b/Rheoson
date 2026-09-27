"""Lyrics — a lookup, not a feature to build.

LRCLIB is a free, keyless, community lyrics API with both plain and
time-synced lyrics. That gives the Now Playing sheet seekable lyric lines
without the stack owning a lyrics database, a scraper or a licence.

Failures are `RNF01` (no lyrics found) rather than a 5xx: \"this track has no
lyrics\" is an answer the UI renders as empty space, not an error the user has
to dismiss.
"""

from __future__ import annotations

from typing import Optional

import httpx
import structlog

log = structlog.get_logger()

LRCLIB_BASE = "https://lrclib.net/api"
USER_AGENT = "Rheoson/0.1 (self-hosted music server; lyrics lookup)"
TIMEOUT = 8.0


def _pick_plain(payload: dict) -> str:
    return payload.get("plainLyrics") or payload.get("lyrics") or ""


async def fetch_lyrics(
    title: str,
    artist: str = "",
    *,
    album: str = "",
    duration: float = 0.0,
) -> Optional[dict]:
    """Plain and synced lyrics for a track, or None.

    The exact-match endpoint is asked first because it is one request and it is
    correct when it hits; the search endpoint is the fallback for the common
    case of a title that differs by punctuation or a featured artist.
    """
    if not title.strip():
        return None

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(TIMEOUT),
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT},
    ) as client:
        params = {"track_name": title, "artist_name": artist}
        if album:
            params["album_name"] = album
        if duration > 0:
            params["duration"] = str(int(round(duration)))

        try:
            res = await client.get(f"{LRCLIB_BASE}/get", params=params)
            if res.status_code == 200:
                payload = res.json()
                if _pick_plain(payload) or payload.get("syncedLyrics"):
                    return _shape(payload, artist, album)
        except Exception as e:  # noqa: BLE001 — fall through to search
            log.debug("lyrics.get.failed", error=str(e))

        try:
            res = await client.get(
                f"{LRCLIB_BASE}/search",
                params={"track_name": title, "artist_name": artist},
            )
            if res.status_code != 200:
                return None
            results = res.json()
        except Exception as e:  # noqa: BLE001
            log.debug("lyrics.search.failed", error=str(e))
            return None

    if not isinstance(results, list) or not results:
        return None
    # Prefer a result that actually carries lyrics over one that is only a
    # metadata match — LRCLIB lists instrumentals too.
    for candidate in results:
        if not isinstance(candidate, dict):
            continue
        if _pick_plain(candidate) or candidate.get("syncedLyrics"):
            return _shape(candidate, artist, album)
    return None


def _shape(payload: dict, artist: str, album: str) -> dict:
    return {
        "plain": _pick_plain(payload),
        "synced": payload.get("syncedLyrics") or "",
        "title": payload.get("trackName") or "",
        "artist": payload.get("artistName") or artist,
        "album": payload.get("albumName") or album,
        "duration": payload.get("duration"),
        "source": "lrclib",
    }


def parse_synced(synced: str) -> list[dict]:
    """Turn an LRC block into `[{startTime, text}]`, in order.

    Kept here (rather than in the client) so both callers agree on what a lyric
    timeline is, and so a malformed line is skipped instead of shifting every
    subsequent timestamp.
    """
    lines: list[dict] = []
    for raw in (synced or "").splitlines():
        if not raw.startswith("["):
            continue
        stamp, _, text = raw.partition("]")
        body = stamp[1:].split(":", 1)
        if len(body) != 2:
            continue
        try:
            minutes = int(body[0])
            seconds = float(body[1])
        except ValueError:
            continue
        lines.append({"startTime": round(minutes * 60 + seconds, 2), "text": text.strip()})
    return lines
