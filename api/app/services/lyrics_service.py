from __future__ import annotations
import re
import structlog
import syncedlyrics
from app.schemas.lyrics import LyricsSchema, LyricsLineSchema

log = structlog.get_logger()


async def get_lyrics(track_id: str, title: str = "", artist: str = "") -> LyricsSchema:
    """
    Fetch synced or plain lyrics.
    Falls back gracefully — synced → plain → empty.
    """
    query = f"{title} {artist}".strip() if title else track_id

    # Try synced first (LRC format)
    try:
        lrc = syncedlyrics.search(query)
        if lrc:
            lines = _parse_lrc(lrc)
            if lines:
                return LyricsSchema(
                    trackId=track_id,
                    synced=True,
                    lines=lines,
                    source="syncedlyrics",
                )
    except Exception as e:
        log.warning("lyrics.synced.failed", query=query, error=str(e))

    # Fall back to plain lyrics
    try:
        plain = syncedlyrics.search(query, plain_only=True)
        if plain:
            lines = [
                LyricsLineSchema(time=0.0, text=line)
                for line in plain.splitlines()
                if line.strip()
            ]
            return LyricsSchema(
                trackId=track_id,
                synced=False,
                lines=lines,
                source="syncedlyrics-plain",
            )
    except Exception as e:
        log.warning("lyrics.plain.failed", query=query, error=str(e))

    return LyricsSchema(trackId=track_id, synced=False, lines=[], source="")


async def get_lyrics_text(track_id: str, title: str = "", artist: str = "") -> str:
    """Return plain text lyrics for embedding in tags."""
    result = await get_lyrics(track_id, title, artist)
    return "\n".join(line.text for line in result.lines)


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