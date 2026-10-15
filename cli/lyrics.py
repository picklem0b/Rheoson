"""Lyrics — fetch, show, save as ``.lrc`` and embed into tags.

Uses the server's :mod:`app.services.lyrics_service` (syncedlyrics) and
:mod:`app.services.metadata_service` (mutagen) so lyrics fetched here are
identical to the ones the web player shows, and embedded ones are written by
the same container-aware tagger.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Optional

from app.core.config import settings
from app.services.lyrics_service import get_lyrics
from app.services.metadata_service import write_tags

from cli import ui

_YT_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
_AUDIO_EXTS = {".mp3", ".m4a", ".mp4", ".flac", ".ogg", ".opus", ".wav"}


def _fmt_time(ms: float) -> str:
    total = ms / 1000.0
    m, s = divmod(int(total), 60)
    return f"{m}:{s:02d}"


def _find_local_file(track_id: str, title: str, artist: str) -> Optional[Path]:
    """Locate a downloaded file for this track.

    First through the stable-identity map (video id → file), which is exact;
    then a title/artist scan of the library and the downloads folder, which
    covers files the map never saw (imported by hand, or renamed).
    """
    if _YT_ID.match(track_id or ""):
        try:
            from app.services import track_identity

            mapped = track_identity.lookup_by_video(track_id)
            if mapped and mapped.get("file_path"):
                p = Path(mapped["file_path"])
                if p.exists():
                    return p
        except Exception:
            pass

    needle = (title or "").lower()
    artist_l = (artist or "").lower()
    roots = [Path(settings.MUSIC_DIR).expanduser(), Path(settings.DOWNLOADS_DIR).expanduser()]
    for root in roots:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if path.suffix.lower() not in _AUDIO_EXTS:
                continue
            if needle and needle in path.stem.lower():
                if not artist_l or artist_l in path.stem.lower() or artist_l in str(path.parent).lower():
                    return path
    return None


async def resolve_query(target: str) -> tuple[str, str, str]:
    """Turn a video id or a search phrase into ``(track_id, title, artist)``."""
    from app.services.ytmusic_service import get_track, search_one

    if _YT_ID.match(target.strip()):
        tid = target.strip()
        try:
            t = await get_track(tid)
            return tid, t.get("title", ""), t.get("artist", {}).get("name", "")
        except Exception:
            return tid, "", ""
    found = await search_one(target.strip())
    if not found:
        return "", target.strip(), ""
    return found.get("youtubeId") or found.get("id", ""), found.get("title", ""), found.get("artist", {}).get("name", "")


async def cmd_lyrics(args) -> int:
    """``rheoson lyrics <track_id|query> [--save] [--embed]``"""
    target = " ".join(args.target).strip()
    if not target:
        ui.err("Usage: lyrics <track_id | query> [--save] [--embed]")
        return 1

    ui.blank()
    ui.info(f"Lyrics for: {ui.B}{target}{ui.R}")
    ui.sep()

    track_id, title, artist = await resolve_query(target)
    lyrics = await get_lyrics(track_id, title=title, artist=artist)

    ui.dim(f"track : {title or '?'}" + (f"  —  {artist}" if artist else ""))
    ui.dim(f"source: {lyrics.source or 'not found'}   synced: {lyrics.synced}")
    ui.blank()

    if not lyrics.lines:
        ui.warn("No lyrics found for this track.")
        ui.blank()
        return 1

    for line in lyrics.lines:
        stamp = f"{ui.DIM}{_fmt_time(line.time)}{ui.R}  " if lyrics.synced else ""
        print(f"  {stamp}{line.text}")

    ui.blank()

    if args.save or args.embed:
        local = _find_local_file(track_id, title, artist)
        if not local:
            ui.warn("No downloaded file found to attach lyrics to (use --save after downloading).")
            ui.blank()
            return 0
        from cli.download import write_lrc

        if args.save or args.embed:
            lrc = write_lrc(local, lyrics)
            ui.ok(f"Saved {ui.DIM}{lrc}{ui.R}")
        if args.embed:
            try:
                write_tags(local, lyrics="\n".join(l.text for l in lyrics.lines))
                ui.ok(f"Embedded lyrics into {ui.DIM}{local.name}{ui.R}")
            except Exception as e:  # noqa: BLE001 — best-effort tagging
                ui.err(f"Could not embed lyrics: {e}")

    ui.blank()
    return 0
