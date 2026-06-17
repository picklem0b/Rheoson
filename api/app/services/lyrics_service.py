from __future__ import annotations
import re
import asyncio
import structlog
import syncedlyrics
from app.schemas.lyrics import LyricsSchema, LyricsLineSchema

log = structlog.get_logger()

# ── LRC parser ────────────────────────────────────────────────

_LRC_RE = re.compile(r"\[(\d+):(\d+)\.(\d+)\](.*)")


def _parse_lrc(lrc: str) -> list[LyricsLineSchema]:
    lines = []
    for raw in lrc.splitlines():
        m = _LRC_RE.match(raw.strip())
        if not m:
            continue
        mins, secs, ms, text = m.groups()
        time_ms = (int(mins) * 60 + int(secs)) * 1000 + int(ms.ljust(3, "0")[:3])
        text    = text.strip()
        if text:
            lines.append(LyricsLineSchema(time=float(time_ms), text=text))
    return lines


# ── Sync helpers (run in executor) ───────────────────────────

def _fetch_synced(query: str) -> str | None:
    """Blocking call — must run in executor."""
    try:
        return syncedlyrics.search(query)
    except Exception:
        return None


def _fetch_plain(query: str) -> str | None:
    """Blocking call — must run in executor."""
    try:
        return syncedlyrics.search(query, plain_only=True)
    except Exception:
        return None


# ── Public API ────────────────────────────────────────────────

async def get_lyrics(
    track_id: str,
    title:    str = "",
    artist:   str = "",
) -> LyricsSchema:
    """
    Fetch synced or plain lyrics.
    Falls back gracefully: synced → plain → empty.
    syncedlyrics.search is synchronous and blocking — wrapped in executor
    so it doesn't stall the event loop.
    """
    query = f"{title} {artist}".strip() if title else track_id
    loop  = asyncio.get_event_loop()

    # Try synced first
    lrc = await loop.run_in_executor(None, _fetch_synced, query)
    if lrc:
        lines = _parse_lrc(lrc)
        if lines:
            log.debug("lyrics.synced.ok", query=query, count=len(lines))
            return LyricsSchema(
                trackId=track_id,
                synced=True,
                lines=lines,
                source="syncedlyrics",
            )

    # Fall back to plain
    log.debug("lyrics.synced.empty", query=query)
    plain = await loop.run_in_executor(None, _fetch_plain, query)
    if plain:
        lines = [
            LyricsLineSchema(time=0.0, text=line)
            for line in plain.splitlines()
            if line.strip()
        ]
        if lines:
            log.debug("lyrics.plain.ok", query=query, count=len(lines))
            return LyricsSchema(
                trackId=track_id,
                synced=False,
                lines=lines,
                source="syncedlyrics-plain",
            )

    log.debug("lyrics.not_found", query=query)
    return LyricsSchema(trackId=track_id, synced=False, lines=[], source="")


async def get_lyrics_text(
    track_id: str,
    title:    str = "",
    artist:   str = "",
) -> str:
    result = await get_lyrics(track_id, title, artist)
    return "\n".join(line.text for line in result.lines)