"""The CLI's download engine.

Everything here drives :mod:`app.services.download_service` — the same job
runner the server uses — so a file fetched from the terminal is byte-for-byte
what the web UI would have produced (same conversion ladder, same mutagen
tagging, same ``videoId → file`` identity record).

Jobs are processed in windows sized to the concurrency limit. The service
already caps the number of *live* yt-dlp processes, but resolution happens at
enqueue time, so firing a 50-track playlist all at once would open 50
metadata lookups against YouTube Music at once. A window keeps that gentle
without giving up the service's own concurrency.
"""

from __future__ import annotations

import asyncio
import re
from pathlib import Path
from typing import Iterable, Optional, Sequence

from app.core.config import settings
from app.services.download_service import enqueue_download, get_job

from cli import ui

CLI_OWNER = "cli"

_ILLEGAL = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def sanitize(name: str, fallback: str = "untitled") -> str:
    """Filesystem-safe folder/file name (kept independent of the service's)."""
    cleaned = _ILLEGAL.sub("_", (name or "").strip())
    cleaned = cleaned.strip(" .")
    return cleaned or fallback


def playlist_dir(name: str) -> Path:
    """``DOWNLOADS_DIR/<Playlist Name>`` — where a playlist's files collect."""
    return Path(settings.DOWNLOADS_DIR).expanduser() / sanitize(name, "Playlist")


async def _await_jobs(
    job_ids: Sequence[str],
    *,
    owner: str = CLI_OWNER,
    label: str = "",
) -> dict[str, dict]:
    """Poll jobs to completion, repainting one aggregate progress line."""
    pending = set(job_ids)
    seen: dict[str, dict] = {}
    while pending:
        await asyncio.sleep(0.5)
        total = 0.0
        status = "downloading"
        for jid in list(pending):
            job = get_job(jid, owner=owner)
            if job is None:
                pending.discard(jid)
                continue
            seen[jid] = job
            total += float(job.get("progress") or 0.0)
            if job.get("status") in ("done", "error", "cancelled"):
                pending.discard(jid)
            elif job.get("status"):
                status = job["status"]
        done_count = sum(1 for j in seen.values() if j.get("status") in ("done", "error", "cancelled"))
        agg = (total / len(job_ids)) if job_ids else 100.0
        ui.progress(agg, status, extra=f"{done_count}/{len(job_ids)} {label}".strip())
    ui.progress_clear()
    return seen


async def run_batch(
    items: Sequence[dict],
    *,
    dest_dir: Optional[Path] = None,
    fmt: str = "mp3",
    quality: str = "320",
    embed_lyrics: bool = True,
    save_lrc: bool = False,
    owner: str = CLI_OWNER,
    concurrency: Optional[int] = None,
    label: str = "",
) -> list[dict]:
    """Download every item, returning one result job per input (same order).

    Each item is either ``{"trackId": ...}`` or ``{"url": ...}``. Files land in
    ``dest_dir`` when given (used for playlist folders), otherwise in the
    library layout the server uses (``MUSIC_DIR/<Artist>/``).
    """
    concurrency = concurrency or max(1, int(settings.MAX_CONCURRENT_DOWNLOADS))
    results: dict[int, dict] = {}

    for start in range(0, len(items), concurrency):
        window = list(enumerate(items))[start : start + concurrency]
        job_index: dict[str, int] = {}
        job_ids: list[str] = []
        for idx, item in window:
            job = await enqueue_download(
                track_id=item.get("trackId"),
                url=item.get("url"),
                fmt=fmt,
                quality=quality,
                embed_artwork=True,
                embed_lyrics=embed_lyrics,
                embed_metadata=True,
                file_naming="artist-title",
                custom_path=str(dest_dir) if dest_dir else None,
                owner=owner,
                retries=3,
                concurrency=concurrency,
            )
            job_index[job["id"]] = idx
            job_ids.append(job["id"])
        seen = await _await_jobs(job_ids, owner=owner, label=label)
        for jid, idx in job_index.items():
            results[idx] = seen.get(jid, {})

    ordered = [results.get(i, {}) for i in range(len(items))]
    if save_lrc:
        await _save_lrcs(ordered)
    return ordered


async def _save_lrcs(jobs: Iterable[dict]) -> None:
    """Write a ``.lrc`` beside each successfully downloaded file."""
    from app.services.lyrics_service import get_lyrics

    for job in jobs:
        if job.get("status") != "done" or not job.get("filePath"):
            continue
        path = Path(job["filePath"])
        if path.with_suffix(".lrc").exists():
            continue
        try:
            lyrics = await get_lyrics(
                job.get("trackId", ""),
                title=job.get("title", ""),
                artist=job.get("artist", ""),
            )
            if lyrics.lines:
                write_lrc(path, lyrics)
        except Exception:
            continue


def write_lrc(audio_path: Path, lyrics) -> Path:
    """Write lyrics next to an audio file as an ``.lrc`` sidecar.

    Synced lyrics keep their ``[mm:ss.xx]`` timestamps; plain lyrics get a
    bare text file with the same name so any player that reads ``.lrc`` picks
    it up alongside the track.
    """
    lrc_path = audio_path.with_suffix(".lrc")
    lines: list[str] = []
    if getattr(lyrics, "synced", False):
        for line in lyrics.lines:
            total = line.time / 1000.0
            minutes = int(total // 60)
            seconds = total - minutes * 60
            lines.append(f"[{minutes:02d}:{seconds:05.2f}]{line.text}")
    else:
        lines = [line.text for line in lyrics.lines]
    lrc_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return lrc_path


async def download_one(
    *,
    track_id: Optional[str] = None,
    url: Optional[str] = None,
    fmt: str = "mp3",
    quality: str = "320",
    embed_lyrics: bool = True,
    save_lrc: bool = False,
    dest_dir: Optional[Path] = None,
) -> dict:
    """Single-track convenience wrapper around :func:`run_batch`."""
    item = {"trackId": track_id} if not url else {"url": url}
    results = await run_batch(
        [item], dest_dir=dest_dir, fmt=fmt, quality=quality,
        embed_lyrics=embed_lyrics, save_lrc=save_lrc,
    )
    return results[0] if results else {}


def summarize(jobs: Sequence[dict]) -> tuple[int, int]:
    """Print a result line per job; return (ok, failed)."""
    ok = failed = 0
    for job in jobs:
        status = job.get("status")
        name = job.get("title") or job.get("trackId") or "—"
        if status == "done":
            ok += 1
            ui.ok(f"{name}  {ui.DIM}→ {job.get('filePath', '')}{ui.R}")
        else:
            failed += 1
            reason = job.get("error") or status or "unknown error"
            ui.err(f"{name}  {ui.DIM}{reason}{ui.R}")
    return ok, failed
