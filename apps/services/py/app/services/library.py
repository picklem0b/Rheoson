"""The local library — what is actually on this disk.

One walk of the data directory produces every list the app shows: tracks,
artists, albums. The walk is cached briefly (``library_ttl``) because a page of
results asks for the same list three times and re-reading a thousand tags per
request is how a scan starts competing with playback.

Identity rules, both taken from the current stack because both are contracts:

* a file the map knows was downloaded keeps its **videoId** as its id;
* anything else is keyed by its **file_id** (``MD5(path)[:16]``).

Paths under a dot-directory (``.staging``, ``.track_map.sqlite``) are never
library content — they are the engine's own bookkeeping.
"""

from __future__ import annotations

import os
import threading
import time
from pathlib import Path
from typing import Optional

import structlog

from app.core import settings as engine_settings
from app.services import identity, metadata

log = structlog.get_logger()

_lock = threading.RLock()
#: ``(scanned_at, data_dir, records)`` — the root is part of the key, because a
#: listing is only ever true of one directory.
_cache: Optional[tuple[float, str, list[dict]]] = None


def invalidate() -> None:
    """Drop the cached listing — called after a download finishes."""
    global _cache
    with _lock:
        _cache = None


def _is_hidden(path: Path) -> bool:
    return any(part.startswith(".") for part in path.parts if part not in (os.sep, ""))


def _iter_audio_files(root: Path):
    """Yield audio files under ``root``, never descending into dot-directories.

    ``os.walk`` is used rather than ``Path.rglob`` so hidden directories can be
    pruned in place instead of walked and filtered afterwards — ``.staging``
    holds half-written downloads, and stats() on a growing ``.part`` file is a
    waste on every scan.
    """
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if not d.startswith(".")]
        for name in filenames:
            if name.startswith("."):
                continue
            candidate = Path(dirpath) / name
            if candidate.suffix.lower() in metadata.AUDIO_EXTENSIONS:
                yield candidate


def scan(force: bool = False) -> list[dict]:
    """Every playable file, as Track dicts. Cached for ``library_ttl`` seconds."""
    global _cache
    settings = engine_settings.load()
    root_key = str(Path(settings.data_dir))
    with _lock:
        if (
            not force
            and _cache is not None
            and _cache[1] == root_key
            and time.time() - _cache[0] < settings.library_ttl
        ):
            return _cache[2]

    root = Path(settings.data_dir)
    records: list[dict] = []
    started = time.time()

    if root.is_dir():
        for path in _iter_audio_files(root):
            try:
                record = metadata.read_track_metadata(path)
            except Exception as e:  # noqa: BLE001 — one bad file, not a bad scan
                log.warning("library.scan.file_failed", path=str(path), error=str(e))
                continue

            mapped = identity.lookup_by_file(record["fileId"])
            if mapped is not None:
                # The file was downloaded as a video: keep that identity, and
                # prefer the recorded title/artist when the tags are missing.
                record["id"] = mapped["video_id"]
                record["videoId"] = mapped["video_id"]
                if mapped.get("title") and record["title"] == path.stem:
                    record["title"] = mapped["title"]
            else:
                record["id"] = record["fileId"]
            records.append(record)

    records.sort(key=lambda r: (r["artist"]["name"].lower(), r["title"].lower()))
    with _lock:
        _cache = (time.time(), root_key, records)

    log.info(
        "library.scan.done",
        files=len(records),
        seconds=round(time.time() - started, 3),
        dataDir=str(root),
    )
    return records


def tracks() -> list[dict]:
    return scan()


def find(track_id: str) -> Optional[dict]:
    """A track record by either of its identities, or None."""
    if not track_id:
        return None

    for track in scan():
        if track["id"] == track_id or track.get("videoId") == track_id:
            return track

    # A file that arrived after the last scan: look the id up directly rather
    # than reporting "not found" for something that exists on disk.
    mapped = identity.lookup_by_video(track_id)
    if mapped is not None:
        path = Path(mapped["file_path"] or "")
        if path.is_file():
            record = metadata.read_track_metadata(path)
            record["id"] = track_id
            record["videoId"] = track_id
            return record
    return None


def path_for(track_id: str) -> Optional[Path]:
    """Absolute path of a local track, or None when it is not on disk."""
    record = find(track_id)
    if record is None:
        return None
    candidate = Path(str(record.get("filePath") or ""))
    return candidate if candidate.is_file() else None


def files_by_id() -> dict[str, Path]:
    """``file_id → path`` for every local track — the artwork lookup table."""
    return {str(track["fileId"]): Path(str(track["filePath"])) for track in scan()}


def artists() -> list[dict]:
    """Artists derived from the library, with their track counts."""
    grouped: dict[str, dict] = {}
    for track in scan():
        name = track["artist"]["name"]
        entry = grouped.setdefault(name, {"id": name, "name": name, "trackCount": 0, "albumCount": set()})
        entry["trackCount"] += 1
        entry["albumCount"].add(track["album"]["title"])
    return [
        {**entry, "albumCount": len(entry["albumCount"])}
        for entry in sorted(grouped.values(), key=lambda a: a["name"].lower())
    ]


def albums() -> list[dict]:
    """Albums derived from the library, with their track counts."""
    grouped: dict[str, dict] = {}
    for track in scan():
        title = track["album"]["title"]
        artist = track["artist"]["name"]
        key = f"{artist}\x00{title}"
        entry = grouped.setdefault(
            key,
            {"id": key, "title": title, "artist": {"id": artist, "name": artist}, "trackCount": 0},
        )
        entry["trackCount"] += 1
    return sorted(grouped.values(), key=lambda a: (a["artist"]["name"].lower(), a["title"].lower()))


def stats() -> dict:
    """Counts and the configured root — no titles, safe for a health surface."""
    records = scan()
    return {
        "tracks": len(records),
        "artists": len(artists()),
        "albums": len(albums()),
        "dataDir": engine_settings.load().data_dir,
    }
