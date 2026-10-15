"""Terminal rendering for the Rheoson CLI.

The look is intentionally unchanged from the original single-file CLI: the
same boxed header, the same ``✓ / ✗ / →`` prefixes, the same dim rule. Every
new command renders through these helpers so the surface cannot drift into a
second visual language.
"""

from __future__ import annotations

from typing import Iterable, Sequence

# ── ANSI palette ──────────────────────────────────────────────
R = "\033[0m"  # reset
B = "\033[1m"  # bold
DIM = "\033[2m"  # dim
RD = "\033[91m"  # red
GR = "\033[92m"  # green
YL = "\033[93m"  # yellow
BL = "\033[94m"  # blue
MG = "\033[95m"  # magenta
CY = "\033[96m"  # cyan
WH = "\033[97m"  # white

WIDTH = 50


# ── Chrome ────────────────────────────────────────────────────


def header() -> None:
    print(
        f"""
{RD}{B}╔══════════════════════════════════╗
║         RHEOSON  CLI             ║
║    music. downloaded. played.    ║
╚══════════════════════════════════╝{R}
"""
    )


def ok(msg: str) -> None:
    print(f"  {GR}✓{R}  {msg}")


def err(msg: str) -> None:
    print(f"  {RD}✗{R}  {msg}")


def warn(msg: str) -> None:
    print(f"  {YL}!{R}  {msg}")


def info(msg: str) -> None:
    print(f"  {CY}→{R}  {msg}")


def dim(msg: str) -> None:
    print(f"  {DIM}{msg}{R}")


def sep() -> None:
    print(f"  {DIM}{'─' * WIDTH}{R}")


def blank() -> None:
    print()


def title(text: str) -> None:
    print(f"  {B}{WH}{text}{R}")


def section(text: str, count: int | None = None) -> None:
    """A ``TRACKS (12)`` style heading used above result groups."""
    tail = f"  {DIM}({count}){R}" if count is not None else ""
    print(f"\n  {B}{WH}{text}{R}{tail}\n")


# ── Formatting ────────────────────────────────────────────────


def fmt_dur(secs: float) -> str:
    if not secs:
        return "--:--"
    m, s = divmod(int(secs), 60)
    h, m = divmod(m, 60)
    if h:
        return f"{h}:{m:02}:{s:02}"
    return f"{m}:{s:02}"


def fmt_size(num_bytes: int) -> str:
    size = float(num_bytes or 0)
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024 or unit == "GB":
            return f"{size:.0f} {unit}" if unit == "B" else f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} GB"


def truncate(text: str, width: int) -> str:
    text = text or ""
    return text if len(text) <= width else text[: width - 1] + "…"


def status_colour(status: str) -> str:
    colours = {
        "queued": YL,
        "searching": BL,
        "downloading": CY,
        "converting": MG,
        "tagging": MG,
        "done": GR,
        "cancelled": YL,
        "error": RD,
    }
    return colours.get(status, WH) + status + R


# ── Rows ──────────────────────────────────────────────────────


def track(t: dict, index: int | None = None) -> None:
    """One search/library result: number, title, artist, duration, id."""
    idx = f"{DIM}{index + 1:>2}.{R} " if index is not None else "  "
    ttl = f"{B}{WH}{t.get('title', 'Unknown')}{R}"
    artist_raw = t.get("artist")
    if isinstance(artist_raw, dict):
        artist_raw = artist_raw.get("name", "")
    artist = f"{CY}{artist_raw or ''}{R}"
    dur = fmt_dur(t.get("duration", 0))
    ytid = t.get("youtubeId") or t.get("id") or ""
    print(f"{idx}{ttl}")
    print(f"     {artist}  {DIM}{dur}  {ytid}{R}")


def table(rows: Sequence[Sequence[str]], headers: Sequence[str]) -> None:
    """A tiny left-aligned table; widths are computed from the content."""
    cols = len(headers)
    widths = [len(str(h)) for h in headers]
    for row in rows:
        for i in range(cols):
            widths[i] = max(widths[i], len(str(row[i]) if i < len(row) else ""))
    print("  " + "  ".join(f"{B}{str(h):<{widths[i]}}{R}" for i, h in enumerate(headers)))
    print(f"  {DIM}{'  '.join('─' * w for w in widths)}{R}")
    for row in rows:
        cells = [str(row[i]) if i < len(row) else "" for i in range(cols)]
        print("  " + "  ".join(f"{c:<{widths[i]}}" for i, c in enumerate(cells)))


def bullets(items: Iterable[str], marker: str = "•") -> None:
    for item in items:
        print(f"  {DIM}{marker}{R} {item}")


# ── Progress ──────────────────────────────────────────────────


def progress(pct: float, status: str, extra: str = "", width: int = 30) -> None:
    """Repaint a single aggregate progress line in place."""
    filled = max(0, min(width, int(width * (pct or 0) / 100)))
    bar = GR + "█" * filled + DIM + "░" * (width - filled) + R
    tail = f"  {DIM}{extra}{R}" if extra else ""
    print(
        f"\r  [{bar}] {YL}{(pct or 0):4.0f}%{R}  {status_colour(status)}{tail}   ",
        end="",
        flush=True,
    )


def progress_clear() -> None:
    print("\r" + " " * (WIDTH + 40) + "\r", end="", flush=True)


# ── Prompt ────────────────────────────────────────────────────


def prompt() -> str:
    return f"  {RD}Rheoson{R} {DIM}›{R} "
