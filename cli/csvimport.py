"""Exportify CSV import — turn a Spotify export into a downloaded playlist.

Exportify writes one row per track with the full Spotify catalogue metadata
(title, artists, album, ISRC, release date, duration, genres, record label).
That CSV is a better source of truth than a re-scrape, so it is read directly
and each row becomes a download.

Two enrichments are layered on top, both optional and both degrading
gracefully:

* the **Spotify API** (when ``SPOTIFY_CLIENT_ID``/``SECRET`` are set) fills in
  artwork and the exact album/duration for each ``spotify:track:`` id;
* **YouTube Music** resolves each track to a playable video id, because the
  download engine fetches from YouTube, not Spotify.

Without Spotify credentials the CSV's own columns are used, so the import
still produces a complete playlist folder.
"""

from __future__ import annotations

import asyncio
import csv
import re
from pathlib import Path
from typing import Sequence

from app.core.config import settings

from cli import ui
from cli.download import summarize
from cli.playlist import _write_manifest, _write_m3u, playlist_dir, run_batch

_SPOTIFY_URI = re.compile(r"spotify:track:([A-Za-z0-9]+)")


def _pretty_name(path: Path) -> str:
    """``Heavenly_songs.csv`` → ``Heavenly songs``."""
    stem = path.stem.replace("_", " ").replace("-", " ")
    return re.sub(r"\s+", " ", stem).strip() or "Playlist"


def _primary_artist(value: str) -> str:
    """Exportify joins multiple artists with ``;`` — keep the first."""
    return (value or "").split(";")[0].strip()


def _split_genres(value: str) -> list[str]:
    return [g.strip() for g in (value or "").split(",") if g.strip()]


def parse_exportify(path: Path) -> list[dict]:
    """Read an Exportify CSV into normalized track dicts."""
    tracks: list[dict] = []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            uri = (row.get("Track URI") or "").strip()
            m = _SPOTIFY_URI.match(uri)
            title = (row.get("Track Name") or "").strip()
            if not title:
                continue
            try:
                duration = float(row.get("Duration (ms)") or 0) / 1000.0
            except ValueError:
                duration = 0.0
            tracks.append(
                {
                    "title": title,
                    "artist": {"name": _primary_artist(row.get("Artist Name(s)", ""))},
                    "album": {"title": (row.get("Album Name") or "").strip()},
                    "duration": duration,
                    "spotifyId": m.group(1) if m else None,
                    "isrc": (row.get("ISRC") or "").strip(),
                    "releaseDate": (row.get("Release Date") or "").strip(),
                    "genres": _split_genres(row.get("Genres", "")),
                    "label": (row.get("Record Label") or "").strip(),
                }
            )
    return tracks


async def _enrich_spotify(tracks: Sequence[dict], concurrency: int = 5, enabled: bool = True) -> int:
    """Fill artwork/album/duration from the Spotify API. Returns how many hit."""
    if not enabled or not settings.has_spotify:
        return 0
    from app.services import spotify_service

    sem = asyncio.Semaphore(concurrency)
    hits = 0

    async def _one(t: dict) -> None:
        nonlocal hits
        sid = t.get("spotifyId")
        if not sid:
            return
        async with sem:
            try:
                sp = await spotify_service.get_track(sid)
            except Exception:
                return
        hits += 1
        t["artworkUrl"] = sp.get("artworkUrl") or t.get("artworkUrl")
        t["duration"] = sp.get("duration") or t.get("duration")
        album = sp.get("album") or {}
        if album.get("title"):
            t["album"] = album
        if album.get("artworkUrl"):
            t["album"]["artworkUrl"] = album["artworkUrl"]

    await asyncio.gather(*[_one(t) for t in tracks])
    return hits


async def _match_youtube(tracks: Sequence[dict], concurrency: int = 5) -> int:
    """Resolve each track to a YouTube Music video id. Returns match count."""
    from app.services.ytmusic_service import search_one

    sem = asyncio.Semaphore(concurrency)
    matched = 0

    async def _one(t: dict) -> None:
        nonlocal matched
        artist = (t.get("artist") or {}).get("name", "") if isinstance(t.get("artist"), dict) else ""
        query = f"{t.get('title', '')} {artist}".strip()
        async with sem:
            try:
                found = await search_one(query)
            except Exception:
                found = None
        if found:
            matched += 1
            t["youtubeId"] = found.get("youtubeId") or found.get("id")
            # Prefer Spotify artwork (professional cover) over YouTube thumbs.
            t["artworkUrl"] = t.get("artworkUrl") or found.get("artworkUrl")

    await asyncio.gather(*[_one(t) for t in tracks])
    return matched


async def _retag_with_metadata(jobs: Sequence[dict], tracks: Sequence[dict]) -> None:
    """Write album/date/track-number tags the download step does not carry."""
    from app.services.metadata_service import write_tags

    by_id = {t.get("youtubeId"): t for t in tracks if t.get("youtubeId")}
    for index, job in enumerate(jobs, start=1):
        if job.get("status") != "done" or not job.get("filePath"):
            continue
        track = by_id.get(job.get("trackId"))
        if not track:
            continue
        album = track.get("album") or {}
        try:
            write_tags(
                Path(job["filePath"]),
                album=album.get("title", "") if isinstance(album, dict) else "",
                date=track.get("releaseDate", ""),
                track_number=index,
            )
        except Exception:
            continue


async def cmd_csv(args) -> int:
    """``rheoson csv <file.csv> [--name NAME] [--limit N] [--dry-run]``"""
    path = Path(args.file).expanduser()
    if not path.is_file():
        ui.err(f"CSV not found: {path}")
        return 1

    name = args.name or _pretty_name(path)
    tracks = parse_exportify(path)
    if args.limit:
        tracks = tracks[: args.limit]
    if not tracks:
        ui.err("No tracks found in that CSV.")
        return 1

    ui.blank()
    ui.info(f"Importing {ui.B}{name}{ui.R}  {ui.DIM}{len(tracks)} tracks{ui.R}")
    ui.dim(f"source: {path}")
    ui.sep()

    spotify_hits = await _enrich_spotify(tracks)
    if settings.has_spotify:
        ui.ok(f"Spotify metadata: {spotify_hits}/{len(tracks)} tracks enriched")
    else:
        ui.dim("Spotify credentials not set — using the CSV's own metadata")
    ui.info("Matching tracks on YouTube Music…")
    matched = await _match_youtube(tracks)
    ui.ok(f"YouTube matches: {matched}/{len(tracks)}")

    unmatched = [t for t in tracks if not t.get("youtubeId")]
    if unmatched:
        ui.warn(f"{len(unmatched)} track(s) had no YouTube match and will be skipped")

    if args.dry_run:
        ui.blank()
        ui.section("Resolved tracks", len(tracks))
        for i, t in enumerate(tracks):
            t.setdefault("duration", 0)
            ui.track(t, i)
        ui.blank()
        ui.dim("dry run — nothing downloaded")
        ui.blank()
        return 0

    playable = [t for t in tracks if t.get("youtubeId")]
    dest = playlist_dir(name)
    dest.mkdir(parents=True, exist_ok=True)

    items = [{"trackId": t["youtubeId"]} for t in playable]
    jobs = await run_batch(
        items,
        dest_dir=dest,
        fmt=args.format,
        quality=args.quality,
        embed_lyrics=True,
        save_lrc=not args.no_lyrics,
        label=name,
    )
    await _retag_with_metadata(jobs, playable)

    ok, failed = summarize(jobs)
    _write_m3u(dest, name, jobs)
    _write_manifest(dest, name, str(path), playable, jobs)

    ui.blank()
    ui.sep()
    ui.ok(f"{ui.GR}{ok}{ui.R} downloaded, {ui.RD if failed else ui.DIM}{failed}{ui.R} failed, {ui.DIM}{len(unmatched)}{ui.R} unmatched")
    ui.dim(f"folder: {dest}")
    ui.blank()
    return 0
