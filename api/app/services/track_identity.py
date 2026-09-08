"""Stable track identity — SQLite sidecar mapping YouTube videoId ↔ local file ID.

Why this exists
---------------
A track changes its identity when it is downloaded: search/history/likes use
the YouTube videoId (11 chars), but local files are indexed by MD5(path)[:16].
That split caused duplicates, unreliable `isDownloaded`, and likes/history
entries that could not be joined back to the downloaded file.

This module records the link (videoId → fileId) at download time so:

  * search results can show `isDownloaded: true` for already-downloaded songs,
  * `GET /tracks/{videoId}` resolves to the local file when it exists,
  * local library entries carry their `youtubeId` (frontend can dedupe),
  * liked / recently-played hydration no longer depends on the YTMusic API
    when the track is already on disk.

Design rules
------------
* Failures degrade to "no mapping" — this store must never break the app.
* Only 11-char YouTube ids are indexed; yt-dlp URLs (SoundCloud, Bandcamp…)
  have no stable video id and are skipped.
* `lookup_by_video` verifies the mapped file still exists so stale rows
  (deleted files) self-heal instead of pointing at broken paths.
* Reads on the hot path (library scan, search fanout) use in-memory mirrors
  built lazily from SQLite, refreshed on every write.
"""

from __future__ import annotations

import os
import re
import sqlite3
import structlog
import threading
from datetime import datetime, timezone
from pathlib import Path

from app.core.config import settings

log = structlog.get_logger()

_YT_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")

# RLock: `_load` (which holds the lock) calls `init` (which also takes
# the lock) — a plain Lock would deadlock the first lookup.
_lock = threading.RLock()
_db_path: Path | None = None

# In-memory mirrors so hot paths never touch the disk per lookup.
_forward: dict[str, dict] | None = None  # video_id -> record
_reverse: dict[str, dict] | None = None  # file_id  -> record


def _db() -> Path:
    global _db_path
    if _db_path is None:
        _db_path = Path(settings.MUSIC_DIR) / ".track_map.sqlite"
    return _db_path


def _connect() -> sqlite3.Connection:
    return sqlite3.connect(str(_db()), timeout=2.0)


def _invalidate_caches() -> None:
    global _forward, _reverse
    _forward = None
    _reverse = None


def init() -> None:
    """Create the mapping table if needed. Never raises."""
    try:
        p = _db()
        p.parent.mkdir(parents=True, exist_ok=True)
        with _lock:
            with _connect() as conn:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS track_map (
                        video_id  TEXT PRIMARY KEY,
                        file_id   TEXT NOT NULL UNIQUE,
                        title     TEXT NOT NULL DEFAULT '',
                        artist    TEXT NOT NULL DEFAULT '',
                        album     TEXT NOT NULL DEFAULT '',
                        file_path TEXT NOT NULL DEFAULT '',
                        added_at  TEXT NOT NULL DEFAULT ''
                    )
                    """
                )
    except Exception as e:
        log.warning("track_identity.init.failed", error=str(e))


def _load() -> tuple[dict[str, dict], dict[str, dict]]:
    """Load (forward, reverse) mirrors, building them once. Never raises."""
    global _forward, _reverse
    with _lock:
        if _forward is not None and _reverse is not None:
            return _forward, _reverse
        fwd: dict[str, dict] = {}
        rev: dict[str, dict] = {}
        try:
            init()
            with _connect() as conn:
                for row in conn.execute(
                    "SELECT video_id, file_id, title, artist, album, file_path FROM track_map"
                ):
                    rec = {
                        "video_id": row[0],
                        "file_id": row[1],
                        "title": row[2],
                        "artist": row[3],
                        "album": row[4],
                        "file_path": row[5],
                    }
                    fwd[row[0]] = rec
                    rev[row[1]] = rec
        except Exception as e:
            log.warning("track_identity.load.failed", error=str(e))
        _forward, _reverse = fwd, rev
        return fwd, rev


def record(
    video_id: str,
    file_id: str,
    title: str = "",
    artist: str = "",
    album: str = "",
    file_path: str = "",
) -> None:
    """Record (or update) the link between a YouTube id and a local file.

    Non-YouTube ids (URLs, short/long junk) are silently skipped — see the
    module docstring.
    """
    if not _YT_ID_RE.match(video_id or ""):
        return
    try:
        init()
        added = datetime.now(timezone.utc).isoformat()
        with _lock:
            with _connect() as conn:
                conn.execute(
                    """
                    INSERT INTO track_map (video_id, file_id, title, artist, album, file_path, added_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(video_id) DO UPDATE SET
                        file_id=excluded.file_id,
                        title=excluded.title,
                        artist=excluded.artist,
                        album=excluded.album,
                        file_path=excluded.file_path
                    """,
                    (video_id, file_id, title, artist, album, file_path, added),
                )
            _invalidate_caches()
        log.debug("track_identity.record", video_id=video_id, file_id=file_id)
    except Exception as e:
        log.warning("track_identity.record.failed", video_id=video_id, error=str(e))


def remove(video_id: str) -> None:
    """Drop a mapping (e.g. when its file is deleted from disk)."""
    try:
        with _lock:
            with _connect() as conn:
                conn.execute("DELETE FROM track_map WHERE video_id = ?", (video_id,))
            _invalidate_caches()
    except Exception as e:
        log.warning("track_identity.remove.failed", video_id=video_id, error=str(e))


def lookup_by_video(video_id: str) -> dict | None:
    """Return the record for a YouTube id, or None. Verifies the file still
    exists so deleted files don't resolve to broken local entries."""
    if not _YT_ID_RE.match(video_id or ""):
        return None
    fwd, _ = _load()
    rec = fwd.get(video_id)
    if not rec:
        return None
    if rec.get("file_path") and not Path(rec["file_path"]).exists():
        remove(video_id)
        return None
    return dict(rec)


def lookup_by_file(file_id: str) -> dict | None:
    """Reverse lookup: local file id → its YouTube source record, or None."""
    if not file_id:
        return None
    _, rev = _load()
    rec = rev.get(file_id)
    return dict(rec) if rec else None


def video_ids_downloaded() -> set[str]:
    """All YouTube ids with a recorded local file (stale rows included —
    callers use this only for cheap `isDownloaded` marking)."""
    fwd, _ = _load()
    return set(fwd.keys())


def local_stream_url(file_id: str) -> str:
    """Absolute /api/stream/{file_id}/audio URL honoring API_BASE_URL."""
    origin = os.environ.get("API_BASE_URL", "").rstrip("/")
    path = f"/api/stream/{file_id}/audio"
    return f"{origin}{path}" if origin else path


def mark_downloaded(tracks: list[dict]) -> None:
    """In-place: set `isDownloaded`/local stream info on track dicts whose
    youtubeId is mapped to a local file. Safe on any list shape; missing
    or malformed entries are skipped."""
    if not tracks:
        return
    downloaded = video_ids_downloaded()
    if not downloaded:
        return
    for t in tracks:
        if not isinstance(t, dict):
            continue
        vid = t.get("youtubeId")
        if not vid or vid not in downloaded:
            continue
        rec = lookup_by_video(vid)
        if not rec:
            continue
        t["isDownloaded"] = True
        t["filePath"] = rec.get("file_path", t.get("filePath", ""))
        if rec.get("file_id"):
            t["streamUrl"] = local_stream_url(rec["file_id"])