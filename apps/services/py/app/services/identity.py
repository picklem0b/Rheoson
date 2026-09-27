"""videoId ↔ local-file identity — the download path's identity contract.

A downloaded track must keep the identity it had as a search result, or every
stored like, playlist entry and history row points at something that no longer
resolves. The engine records both directions in one SQLite sidecar
(``.track_map.sqlite``):

* forward: ``video_id → {file_id, title, artist, album, file_path, added_at}``
* reverse: ``file_id → {video_id, …}``

Both mirrors are loaded once and kept in memory; SQLite is the durable copy, the
dicts are what request paths read. Exactly the contract the previous stack
proved out (``app/services/track_identity.py``), including the two behaviours
that matter: every write invalidates the mirrors, and no read ever raises —
a broken sidecar degrades ``isDownloaded`` for a moment, it does not break
playback.
"""

from __future__ import annotations

import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import structlog

from app.core import settings as engine_settings

log = structlog.get_logger()

_lock = threading.RLock()
_forward: Optional[dict[str, dict]] = None
_reverse: Optional[dict[str, dict]] = None
_schema_ready = False


def db_path() -> Path:
    """The sidecar's location — inside the data dir, beside the music."""
    return Path(engine_settings.load().data_dir) / ".track_map.sqlite"


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path()), timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def init() -> None:
    """Create the table if absent. Never raises: a read-only data dir must not
    stop the engine from starting, it only stops it from remembering."""
    _ensure_schema()


def _ensure_schema() -> None:
    """Create the sidecar table once per process. Never raises."""
    global _schema_ready
    try:
        db_path().parent.mkdir(parents=True, exist_ok=True)
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
    except Exception as e:  # noqa: BLE001 — degraded, not fatal
        log.warning("identity.init.failed", error=str(e))
    # Recorded either way: a read-only data dir must not retry the same failing
    # DDL on every lookup for the rest of the process's life.
    _schema_ready = True


def _load() -> tuple[dict[str, dict], dict[str, dict]]:
    """Load (forward, reverse) mirrors, building them once."""
    global _forward, _reverse
    with _lock:
        if _forward is not None and _reverse is not None:
            return _forward, _reverse

        # Lazy schema creation: a read must never be the reason the table is
        # missing, whether or not the app's boot hook ran first.
        if not _schema_ready:
            _ensure_schema()

        forward: dict[str, dict] = {}
        reverse: dict[str, dict] = {}
        try:
            with _connect() as conn:
                for row in conn.execute("SELECT * FROM track_map"):
                    entry = {
                        "video_id": row["video_id"],
                        "file_id": row["file_id"],
                        "title": row["title"],
                        "artist": row["artist"],
                        "album": row["album"],
                        "file_path": row["file_path"],
                        "added_at": row["added_at"],
                    }
                    forward[row["video_id"]] = entry
                    reverse[row["file_id"]] = entry
        except Exception as e:  # noqa: BLE001 — an unreadable map reads as empty
            log.warning("identity.load.failed", error=str(e))

        _forward, _reverse = forward, reverse
        return forward, reverse


def _invalidate() -> None:
    global _forward, _reverse
    with _lock:
        _forward = None
        _reverse = None


def reset_caches() -> None:
    """Drop the mirrors **and** the schema verdict.

    Both belong to one data directory. Forgetting only the mirrors would leave
    a process convinced it had already created a table in a directory it has
    since been pointed away from.
    """
    global _schema_ready
    _schema_ready = False
    _invalidate()


def record(
    video_id: str,
    file_id: str,
    *,
    title: str = "",
    artist: str = "",
    album: str = "",
    file_path: str = "",
) -> None:
    """Record one downloaded track. Idempotent on ``video_id``.

    ``file_id`` is unique: re-recording the same file under a new video id is a
    replacement, not a duplicate, so the old row is removed first.
    """
    if not video_id or not file_id:
        return
    if not _schema_ready:
        _ensure_schema()
    added_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    try:
        with _connect() as conn:
            conn.execute("DELETE FROM track_map WHERE file_id = ? AND video_id <> ?", (file_id, video_id))
            conn.execute(
                """
                INSERT INTO track_map (video_id, file_id, title, artist, album, file_path, added_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(video_id) DO UPDATE SET
                    file_id  = excluded.file_id,
                    title    = excluded.title,
                    artist   = excluded.artist,
                    album    = excluded.album,
                    file_path= excluded.file_path
                """,
                (video_id, file_id, title, artist, album, file_path, added_at),
            )
    except Exception as e:  # noqa: BLE001
        log.warning("identity.record.failed", video_id=video_id, error=str(e))
    finally:
        _invalidate()


def remove(video_id: str) -> None:
    """Forget a track — used when its file is deleted."""
    if not video_id:
        return
    if not _schema_ready:
        _ensure_schema()
    try:
        with _connect() as conn:
            conn.execute("DELETE FROM track_map WHERE video_id = ?", (video_id,))
    except Exception as e:  # noqa: BLE001
        log.warning("identity.remove.failed", video_id=video_id, error=str(e))
    finally:
        _invalidate()


def lookup_by_video(video_id: str) -> Optional[dict]:
    """The local file for a video id, or None."""
    if not video_id:
        return None
    forward, _ = _load()
    return forward.get(video_id)


def lookup_by_file(file_id: str) -> Optional[dict]:
    """The video id a local file was downloaded as, or None."""
    if not file_id:
        return None
    _, reverse = _load()
    return reverse.get(file_id)


def video_ids_downloaded() -> set[str]:
    """Every downloaded video id — lets a search result show as downloaded."""
    forward, _ = _load()
    return set(forward.keys())


def mark_downloaded(tracks: list[dict]) -> None:
    """Set ``isDownloaded``/``videoId`` on track dicts in place, from the map.

    One dict lookup per track: the point of loading the mirrors is that a list
    of 50 search results does not become 50 queries.
    """
    for track in tracks:
        track_id = str(track.get("id") or "")
        entry = lookup_by_video(track_id)
        if entry is not None:
            track["isDownloaded"] = True
            track["videoId"] = entry["video_id"]
        else:
            track["isDownloaded"] = bool(track.get("isDownloaded", False))


def stats() -> dict:
    """Counts for the health surface — no file paths, no titles."""
    forward, _ = _load()
    return {"mappedTracks": len(forward), "db": str(db_path())}
