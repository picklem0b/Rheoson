"""Playlist downloads — one folder per playlist under ``downloads/``.

A playlist is a unit of intent, not a pile of loose tracks, so it is kept
together:

    downloads/
      Heavenly songs/
        James Newton Howard - The Hanging Tree.mp3
        James Newton Howard - The Hanging Tree.lrc
        Billie Eilish - bury a friend.mp3
        Heavenly songs.m3u        # portable playlist
        playlist.json             # full resolved metadata + provenance

The ``.m3u`` is what makes the folder usable on any player/DAP without the
app, and ``playlist.json`` keeps the richer metadata (album, ISRC, genres)
that audio tags cannot always hold.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Sequence

from app.services import search_service

from cli import ui
from cli.download import playlist_dir, run_batch, sanitize


def _name_from_url(url: str) -> str:
    """A decent default folder name when the source carries no title."""
    tail = url.rstrip("/").split("/")[-1].split("?")[0]
    return sanitize(tail or "Playlist", "Playlist")


async def resolve_playlist(url: str) -> tuple[str, list[dict], dict]:
    """Resolve a playlist URL → ``(name, tracks, source_meta)``.

    Reuses the server's resolver so a Spotify/YouTube/SoundCloud link behaves
    exactly as it does in the web app, including the Spotify → YouTube Music
    matching used to turn catalogue tracks into playable ids.
    """
    result = await search_service.resolve_url(url)
    tracks = result.get("tracks", []) or []
    playlists = result.get("playlists", []) or []
    source_meta = playlists[0] if playlists else {}
    name = source_meta.get("title") or _name_from_url(url)
    return name, tracks, source_meta


def _write_m3u(dest: Path, name: str, jobs: Sequence[dict]) -> Optional[Path]:
    """Write an ``.m3u`` of the successfully downloaded files."""
    lines = ["#EXTM3U"]
    wrote_any = False
    for job in jobs:
        if job.get("status") != "done" or not job.get("filePath"):
            continue
        path = Path(job["filePath"])
        duration = int(float(job.get("duration") or 0))
        artist = job.get("artist") or ""
        title = job.get("title") or path.stem
        lines.append(f"#EXTINF:{duration},{artist} - {title}")
        lines.append(path.name)
        wrote_any = True
    if not wrote_any:
        return None
    m3u = dest / f"{sanitize(name, 'Playlist')}.m3u"
    m3u.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return m3u


def _write_manifest(dest: Path, name: str, source: str, tracks: Sequence[dict], jobs: Sequence[dict]) -> Path:
    """Persist the resolved playlist so it can be re-run or audited later."""
    by_id = {j.get("trackId"): j for j in jobs}
    entries = []
    for t in tracks:
        tid = t.get("youtubeId") or t.get("id") or ""
        job = by_id.get(tid, {})
        entries.append(
            {
                "title": t.get("title", ""),
                "artist": (t.get("artist") or {}).get("name", "") if isinstance(t.get("artist"), dict) else t.get("artist", ""),
                "album": (t.get("album") or {}).get("title", "") if isinstance(t.get("album"), dict) else "",
                "duration": t.get("duration", 0),
                "youtubeId": tid,
                "spotifyId": t.get("spotifyId"),
                "isrc": t.get("isrc"),
                "file": job.get("filePath"),
                "status": job.get("status"),
            }
        )
    manifest = {
        "name": name,
        "source": source,
        "downloadedAt": datetime.now(timezone.utc).isoformat(),
        "trackCount": len(entries),
        "tracks": entries,
    }
    path = dest / "playlist.json"
    path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    return path


async def run_playlist(
    name: str,
    tracks: Sequence[dict],
    *,
    source: str = "",
    fmt: str = "mp3",
    quality: str = "320",
    save_lrc: bool = True,
    embed_lyrics: bool = True,
) -> tuple[list[dict], Path]:
    """Download every track into ``downloads/<name>/`` and index the folder."""
    dest = playlist_dir(name)
    dest.mkdir(parents=True, exist_ok=True)

    ui.blank()
    ui.info(f"Playlist {ui.B}{name}{ui.R}  {ui.DIM}{len(tracks)} tracks{ui.R}")
    ui.dim(f"folder: {dest}")
    ui.sep()

    items = [{"trackId": t.get("youtubeId") or t.get("id")} for t in tracks]
    items = [i for i in items if i.get("trackId")]
    jobs = await run_batch(
        items,
        dest_dir=dest,
        fmt=fmt,
        quality=quality,
        embed_lyrics=embed_lyrics,
        save_lrc=save_lrc,
        label=name,
    )

    from cli.download import summarize

    ok, failed = summarize(jobs)
    m3u = _write_m3u(dest, name, jobs)
    _write_manifest(dest, name, source, tracks, jobs)

    ui.blank()
    ui.sep()
    ui.ok(f"{ui.GR}{ok}{ui.R} downloaded, {ui.RD if failed else ui.DIM}{failed}{ui.R} failed")
    if m3u:
        ui.ok(f"Playlist: {ui.DIM}{m3u}{ui.R}")
    ui.dim(f"folder: {dest}")
    ui.blank()
    return jobs, dest


async def cmd_playlist(args) -> int:
    """``rheoson playlist <url> [--name NAME] [--format mp3]``"""
    url = args.url
    ui.blank()
    ui.info(f"Resolving playlist: {ui.DIM}{url}{ui.R}")
    try:
        name, tracks, _meta = await resolve_playlist(url)
    except Exception as e:  # noqa: BLE001 — surface the resolver's message
        ui.err(f"Could not resolve playlist: {e}")
        ui.blank()
        return 1

    if not tracks:
        ui.err("No tracks resolved from that link.")
        ui.blank()
        return 1

    if args.name:
        name = args.name
    await run_playlist(
        name,
        tracks,
        source=url,
        fmt=args.format,
        quality=args.quality,
        save_lrc=not args.no_lyrics,
    )
    return 0
