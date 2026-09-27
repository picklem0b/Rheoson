"""Search — one query answered from two places.

* **Local first.** A library hit needs no network, no extraction and no
  quota, so it is always the better answer when it exists.
* **YouTube second**, through ``yt-dlp``'s own search extractor, flattened and
  parsed from JSON. This is the same tool the download path uses, so a result
  that shows up here is a result that can be played and downloaded.

Every returned track is passed through the identity map, which is what makes
``isDownloaded`` trustworthy: it is a fact about the disk, not a guess from a
title match.
"""

from __future__ import annotations

import json
import subprocess
from typing import Optional

import structlog

from app.core import settings as engine_settings, toolchain
from app.services import identity, library

log = structlog.get_logger()

#: How many results one remote search asks for. The old stack used 20, which is
#: enough to fill a screen and still one extraction.
SEARCH_LIMIT = 20

#: A query reaches a subprocess argument, so it is length-bounded here as well
#: as at the HTTP surface.
MAX_QUERY_LEN = 200


def clean_query(query: str) -> str:
    """Trim and bound a query. Control characters are stripped so a query can
    never carry a newline into a log line or an argument."""
    text = "".join(ch for ch in (query or "") if ch.isprintable()).strip()
    return text[:MAX_QUERY_LEN]


def search_local(query: str, limit: int = SEARCH_LIMIT) -> list[dict]:
    """Substring match over title and artist, case-insensitive.

    Deliberately simple: the library path serves a precise-answer use case, and
    Meilisearch takes over ranking when it is configured.
    """
    needle = clean_query(query).lower()
    if not needle:
        return []

    hits: list[dict] = []
    for track in library.scan():
        haystack = f"{track['title']} {track['artist']['name']} {track['album']['title']}".lower()
        if needle in haystack:
            hits.append({**track, "source": "local"})
            if len(hits) >= limit:
                break
    return hits


def _flat_entry(entry: dict) -> Optional[dict]:
    """Convert one flat yt-dlp search entry into a Track dict."""
    video_id = entry.get("id")
    if not isinstance(video_id, str) or not video_id:
        return None

    artist_name = (
        entry.get("channel")
        or entry.get("uploader")
        or entry.get("artist")
        or "Unknown Artist"
    )
    duration = entry.get("duration")
    thumbnail = entry.get("thumbnail")
    if not thumbnail:
        thumbs = entry.get("thumbnails") or []
        if thumbs and isinstance(thumbs[-1], dict):
            thumbnail = thumbs[-1].get("url")

    return {
        "id": video_id,
        "videoId": video_id,
        "title": entry.get("title") or video_id,
        "artist": {"id": str(artist_name), "name": str(artist_name)},
        "album": {"id": "Unknown Album", "title": "Unknown Album"},
        "duration": float(duration) if isinstance(duration, (int, float)) else None,
        "artworkUrl": thumbnail,
        "source": "youtube",
        "isDownloaded": False,
    }


def search_remote(query: str, limit: int = SEARCH_LIMIT) -> list[dict]:
    """Ask YouTube. Returns [] on any failure — a dead search is not an error
    the caller has to handle, it just has no results."""
    text = clean_query(query)
    if not text or not toolchain.ytdlp().available:
        return []

    settings = engine_settings.load()
    cmd = [
        toolchain.ytdlp_bin(),
        "--quiet",
        "--no-warnings",
        "--flat-playlist",
        "--dump-single-json",
        "--no-playlist",
        f"ytsearch{limit}:{text}",
    ]
    try:
        proc = subprocess.run(
            cmd, capture_output=True, timeout=settings.search_timeout, check=False
        )
    except subprocess.TimeoutExpired:
        log.warning("search.timeout", query=text[:60])
        return []
    except Exception as e:  # noqa: BLE001
        log.warning("search.spawn_failed", error=str(e))
        return []

    if not proc.stdout:
        log.info(
            "search.no_output",
            query=text[:60],
            error=(proc.stderr or b"").decode("utf-8", "replace").strip()[-160:],
        )
        return []

    try:
        payload = json.loads(proc.stdout.decode("utf-8", "replace"))
    except json.JSONDecodeError as e:
        log.warning("search.bad_json", error=str(e))
        return []

    entries = payload.get("entries") or []
    tracks = [t for t in (_flat_entry(e) for e in entries if isinstance(e, dict)) if t]
    identity.mark_downloaded(tracks)
    return tracks


def search(query: str, *, include_remote: bool = True) -> dict:
    """The combined answer: the full response shape the client renders."""
    text = clean_query(query)
    local = search_local(text)
    remote = search_remote(text) if include_remote and text else []

    seen_local = {track["id"] for track in local}
    merged = local + [track for track in remote if track["id"] not in seen_local]
    return {
        "query": text,
        "local": local,
        "remote": remote,
        "tracks": merged,
        "remoteAvailable": toolchain.ytdlp().available,
    }
