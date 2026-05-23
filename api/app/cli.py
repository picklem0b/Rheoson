#!/usr/bin/env python3
"""
Shulker CLI — talk to the API from your terminal.
Usage: python app/cli.py <command> [args]

Commands:
  search <query>              Search YouTube Music
  resolve <url>               Resolve any URL (Spotify, YouTube, SoundCloud...)
  download <query|url>        Download a track
  downloads                   List all download jobs
  status <job_id>             Check a download job status
  cancel <job_id>             Cancel a download
  stream <track_id>           Get stream URL for a track
  lyrics <track_id>           Fetch lyrics
  library                     List local library
  health                      Check API health
  clear                       Clear terminal
"""
from __future__ import annotations
import sys
import asyncio
import httpx
import json
from datetime import datetime

# ── Config ────────────────────────────────────────────────────
API_BASE = "http://127.0.0.1:8000/api"
TIMEOUT  = 30

# ── ANSI colours ──────────────────────────────────────────────
R  = "\033[0m"        # reset
B  = "\033[1m"        # bold
DIM= "\033[2m"        # dim
RD = "\033[91m"       # red
GR = "\033[92m"       # green
YL = "\033[93m"       # yellow
BL = "\033[94m"       # blue
MG = "\033[95m"       # magenta
CY = "\033[96m"       # cyan
WH = "\033[97m"       # white


# ── Print helpers ─────────────────────────────────────────────

def _header():
    print(f"""
{RD}{B}╔══════════════════════════════════╗
║         SHULKER  CLI             ║
║    music. downloaded. played.    ║
╚══════════════════════════════════╝{R}
""")


def _ok(msg: str):
    print(f"  {GR}✓{R}  {msg}")


def _err(msg: str):
    print(f"  {RD}✗{R}  {msg}")


def _info(msg: str):
    print(f"  {CY}→{R}  {msg}")


def _dim(msg: str):
    print(f"  {DIM}{msg}{R}")


def _sep():
    print(f"  {DIM}{'─' * 50}{R}")


def _track(t: dict, index: int | None = None):
    idx    = f"{DIM}{index + 1:>2}.{R} " if index is not None else "  "
    title  = f"{B}{WH}{t.get('title', 'Unknown')}{R}"
    artist = f"{CY}{t.get('artist', {}).get('name', '')}{R}"
    dur    = _fmt_dur(t.get("duration", 0))
    ytid   = t.get("youtubeId") or t.get("id") or ""
    print(f"{idx}{title}")
    print(f"     {artist}  {DIM}{dur}  {ytid}{R}")


def _fmt_dur(secs: float) -> str:
    if not secs:
        return "--:--"
    m, s = divmod(int(secs), 60)
    h, m = divmod(m, 60)
    if h:
        return f"{h}:{m:02}:{s:02}"
    return f"{m}:{s:02}"


def _status_colour(status: str) -> str:
    colours = {
        "queued":      YL,
        "searching":   BL,
        "downloading": CY,
        "converting":  MG,
        "tagging":     MG,
        "done":        GR,
        "error":       RD,
    }
    return colours.get(status, WH) + status + R


# ── HTTP helpers ──────────────────────────────────────────────

async def _get(path: str, params: dict | None = None) -> dict | list:
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        r = await client.get(f"{API_BASE}{path}", params=params)
        r.raise_for_status()
        return r.json()


async def _post(path: str, body: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        r = await client.post(f"{API_BASE}{path}", json=body or {})
        r.raise_for_status()
        return r.json()


async def _delete(path: str) -> dict:
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        r = await client.delete(f"{API_BASE}{path}")
        r.raise_for_status()
        return r.json()


# ── Commands ──────────────────────────────────────────────────

async def cmd_health():
    print()
    _info("Checking API health…")
    try:
        r = await _get("/health")
        _ok(f"API is {GR}{B}online{R}")
        _dim(f"version : {r.get('version', '?')}")
        _dim(f"env     : {r.get('env', '?')}")
        _dim(f"music   : {r.get('music_dir', '?')}")
        _dim(f"dl dir  : {r.get('downloads_dir', '?')}")
    except Exception as e:
        _err(f"API unreachable — {e}")
        _dim("Is the server running?  uvicorn app.main:socket_app --port 8000")
    print()


async def cmd_search(query: str, filter: str | None = None):
    print()
    _info(f"Searching: {B}{query}{R}")
    _sep()
    try:
        r = await _get("/search", params={"q": query, **({"filter": filter} if filter else {})})
        tracks    = r.get("tracks", [])
        albums    = r.get("albums", [])
        artists   = r.get("artists", [])
        playlists = r.get("playlists", [])

        if tracks:
            print(f"\n  {B}{WH}Tracks{R}  {DIM}({len(tracks)}){R}\n")
            for i, t in enumerate(tracks[:10]):
                _track(t, i)

        if artists:
            print(f"\n  {B}{WH}Artists{R}  {DIM}({len(artists)}){R}\n")
            for a in artists[:5]:
                print(f"     {MG}{B}{a.get('name')}{R}  {DIM}{a.get('id')}{R}")

        if albums:
            print(f"\n  {B}{WH}Albums{R}  {DIM}({len(albums)}){R}\n")
            for al in albums[:5]:
                print(f"     {BL}{B}{al.get('title')}{R}  {DIM}{al.get('artist', {}).get('name')}{R}")

        if playlists:
            print(f"\n  {B}{WH}Playlists{R}  {DIM}({len(playlists)}){R}\n")
            for pl in playlists[:5]:
                print(f"     {CY}{B}{pl.get('title')}{R}  {DIM}{pl.get('trackCount')} tracks{R}")

        if not any([tracks, albums, artists, playlists]):
            _err(f"No results for '{query}'")

    except Exception as e:
        _err(f"Search failed: {e}")
    print()


async def cmd_resolve(url: str):
    print()
    _info(f"Resolving: {DIM}{url}{R}")
    _sep()
    try:
        r = await _post("/search/resolve", {"url": url})
        res_type = r.get("type", "unknown")
        tracks   = r.get("tracks", [])
        print(f"\n  {BL}Type:{R} {B}{res_type}{R}  {DIM}({len(tracks)} tracks){R}\n")
        for i, t in enumerate(tracks[:20]):
            _track(t, i)
        if not tracks:
            _err("Could not resolve URL — no tracks found")
    except httpx.HTTPStatusError as e:
        body = e.response.json() if e.response.content else {}
        _err(f"Failed: {body.get('detail', str(e))}")
    except Exception as e:
        _err(f"Resolve failed: {e}")
    print()


async def cmd_download(query_or_url: str, fmt: str = "mp3", quality: str = "320"):
    print()
    _info(f"Queueing download: {B}{query_or_url}{R}")
    _dim(f"format: {fmt}  quality: {quality}kbps")
    _sep()

    is_url = query_or_url.strip().startswith("http")
    body   = {
        "format":       fmt,
        "quality":      quality,
        "embedArtwork": True,
        "embedLyrics":  True,
    }
    if is_url:
        body["url"] = query_or_url
    else:
        # Plain query — search first, take top result
        _info("Searching for best match…")
        try:
            r      = await _get("/search", params={"q": query_or_url})
            tracks = r.get("tracks", [])
            if not tracks:
                _err("No results found")
                print()
                return
            top = tracks[0]
            _ok(f"Found: {B}{top.get('title')}{R}  {DIM}{top.get('artist', {}).get('name')}{R}")
            body["trackId"] = top.get("youtubeId") or top.get("id")
        except Exception as e:
            _err(f"Search failed: {e}")
            print()
            return

    try:
        job = await _post("/downloads", body)
        _ok(f"Job queued: {GR}{B}{job.get('id')}{R}")
        _dim(f"track  : {job.get('title', '?')}")
        _dim(f"status : {_status_colour(job.get('status', '?'))}")
        print()

        # Poll until done
        job_id = job.get("id")
        _info("Tracking progress…")
        import time
        while True:
            await asyncio.sleep(2)
            try:
                j       = await _get(f"/downloads/{job_id}")
                status  = j.get("status", "")
                prog    = j.get("progress", 0)
                bar_len = 30
                filled  = int(bar_len * prog / 100)
                bar     = GR + "█" * filled + DIM + "░" * (bar_len - filled) + R
                print(f"\r  [{bar}] {YL}{prog:.0f}%{R}  {_status_colour(status)}   ", end="", flush=True)
                if status in ("done", "error"):
                    print()
                    if status == "done":
                        _ok(f"Downloaded → {GR}{j.get('filePath', '')}{R}")
                    else:
                        _err(f"Failed: {j.get('error', 'unknown error')}")
                    break
            except Exception:
                break

    except httpx.HTTPStatusError as e:
        body_r = e.response.json() if e.response.content else {}
        _err(f"Download failed: {body_r.get('detail', str(e))}")
    except Exception as e:
        _err(f"Error: {e}")
    print()


async def cmd_downloads():
    print()
    _info("All download jobs")
    _sep()
    try:
        jobs = await _get("/downloads")
        if not jobs:
            _dim("No downloads yet.")
            print()
            return
        for j in jobs:
            status = _status_colour(j.get("status", ""))
            prog   = j.get("progress", 0)
            title  = j.get("title") or j.get("trackId") or "—"
            jid    = j.get("id", "")[:8]
            print(f"  {DIM}{jid}{R}  {B}{title[:35]:<35}{R}  {status}  {YL}{prog:.0f}%{R}")
    except Exception as e:
        _err(f"Failed: {e}")
    print()


async def cmd_status(job_id: str):
    print()
    try:
        j = await _get(f"/downloads/{job_id}")
        print(f"\n  {B}Job:{R}  {j.get('id')}")
        print(f"  {B}Title:{R} {j.get('title', '—')}")
        print(f"  {B}Artist:{R} {j.get('artist', '—')}")
        print(f"  {B}Status:{R} {_status_colour(j.get('status', ''))}")
        print(f"  {B}Progress:{R} {YL}{j.get('progress', 0):.1f}%{R}")
        if j.get("filePath"):
            _ok(f"Saved at: {j['filePath']}")
        if j.get("error"):
            _err(f"Error: {j['error']}")
    except Exception as e:
        _err(f"Failed: {e}")
    print()


async def cmd_cancel(job_id: str):
    print()
    try:
        await _post(f"/downloads/{job_id}/cancel")
        _ok(f"Cancelled: {job_id}")
    except Exception as e:
        _err(f"Failed: {e}")
    print()


async def cmd_lyrics(track_id: str):
    print()
    _info(f"Fetching lyrics for: {track_id}")
    _sep()
    try:
        r     = await _get(f"/lyrics/{track_id}")
        lines = r.get("lines", [])
        synced= r.get("synced", False)
        _dim(f"synced: {synced}  source: {r.get('source', '?')}")
        print()
        for line in lines:
            t   = line.get("time", 0)
            txt = line.get("text", "")
            ts  = f"{DIM}{_fmt_dur(t / 1000)}{R}" if synced else ""
            print(f"  {ts}  {txt}")
    except Exception as e:
        _err(f"Failed: {e}")
    print()


async def cmd_stream(track_id: str):
    print()
    _ok(f"Stream URL:")
    print(f"\n  {CY}{API_BASE}/stream/{track_id}/audio{R}\n")
    _dim("Copy this URL into any media player (VLC, mpv, etc)")
    print()


async def cmd_library():
    print()
    _info("Local library")
    _sep()
    try:
        r      = await _get("/tracks")
        tracks = r if isinstance(r, list) else r.get("tracks", [])
        if not tracks:
            _dim("Library is empty. Download some tracks first.")
            print()
            return
        print(f"\n  {DIM}{len(tracks)} tracks{R}\n")
        for i, t in enumerate(tracks):
            _track(t, i)
    except Exception as e:
        _err(f"Failed: {e}")
    print()


async def cmd_interactive():
    """Interactive REPL mode."""
    _header()
    print(f"  {DIM}Type a command or 'help'. Ctrl+C to exit.{R}\n")

    HELP = f"""
  {B}Commands:{R}
  {GR}search{R}   <query>         Search YouTube Music
  {GR}resolve{R}  <url>           Resolve any music URL
  {GR}dl{R}       <query|url>     Download a track
  {GR}dls{R}                      List all downloads
  {GR}status{R}   <job_id>        Check download status
  {GR}cancel{R}   <job_id>        Cancel a download
  {GR}stream{R}   <track_id>      Get stream URL
  {GR}lyrics{R}   <track_id>      Fetch lyrics
  {GR}lib{R}                      Browse local library
  {GR}health{R}                   API health check
  {GR}clear{R}                    Clear screen
  {GR}quit{R}                     Exit
"""

    while True:
        try:
            raw   = input(f"  {RD}shulker{R} {DIM}›{R} ").strip()
            parts = raw.split(None, 1)
            if not parts:
                continue
            cmd  = parts[0].lower()
            args = parts[1] if len(parts) > 1 else ""

            if cmd in ("quit", "exit", "q"):
                print(f"\n  {DIM}bye.{R}\n")
                break
            elif cmd == "clear":
                import os; os.system("clear")
            elif cmd == "help":
                print(HELP)
            elif cmd == "health":
                await cmd_health()
            elif cmd == "search":
                if not args:
                    _err("Usage: search <query>")
                else:
                    await cmd_search(args)
            elif cmd == "resolve":
                if not args:
                    _err("Usage: resolve <url>")
                else:
                    await cmd_resolve(args)
            elif cmd in ("dl", "download"):
                if not args:
                    _err("Usage: dl <query or url>")
                else:
                    await cmd_download(args)
            elif cmd == "dls":
                await cmd_downloads()
            elif cmd == "status":
                if not args:
                    _err("Usage: status <job_id>")
                else:
                    await cmd_status(args)
            elif cmd == "cancel":
                if not args:
                    _err("Usage: cancel <job_id>")
                else:
                    await cmd_cancel(args)
            elif cmd == "stream":
                if not args:
                    _err("Usage: stream <track_id>")
                else:
                    await cmd_stream(args)
            elif cmd == "lyrics":
                if not args:
                    _err("Usage: lyrics <track_id>")
                else:
                    await cmd_lyrics(args)
            elif cmd == "lib":
                await cmd_library()
            else:
                _err(f"Unknown command: '{cmd}'  —  type 'help'")

        except KeyboardInterrupt:
            print(f"\n\n  {DIM}bye.{R}\n")
            break
        except EOFError:
            break


# ── Entry point ───────────────────────────────────────────────

def main():
    args = sys.argv[1:]

    if not args:
        # No args — drop into interactive mode
        asyncio.run(cmd_interactive())
        return

    cmd = args[0].lower()

    match cmd:
        case "health":
            asyncio.run(cmd_health())
        case "search":
            q = " ".join(args[1:])
            if not q:
                print("Usage: shulker search <query>")
                sys.exit(1)
            asyncio.run(cmd_search(q))
        case "resolve":
            if len(args) < 2:
                print("Usage: shulker resolve <url>")
                sys.exit(1)
            asyncio.run(cmd_resolve(args[1]))
        case "dl" | "download":
            if len(args) < 2:
                print("Usage: shulker dl <query or url>")
                sys.exit(1)
            fmt     = "mp3"
            quality = "320"
            for a in args[2:]:
                if a.startswith("--format="):   fmt     = a.split("=")[1]
                if a.startswith("--quality="):  quality = a.split("=")[1]
            asyncio.run(cmd_download(args[1], fmt, quality))
        case "dls" | "downloads":
            asyncio.run(cmd_downloads())
        case "status":
            if len(args) < 2:
                print("Usage: shulker status <job_id>")
                sys.exit(1)
            asyncio.run(cmd_status(args[1]))
        case "cancel":
            if len(args) < 2:
                print("Usage: shulker cancel <job_id>")
                sys.exit(1)
            asyncio.run(cmd_cancel(args[1]))
        case "stream":
            if len(args) < 2:
                print("Usage: shulker stream <track_id>")
                sys.exit(1)
            asyncio.run(cmd_stream(args[1]))
        case "lyrics":
            if len(args) < 2:
                print("Usage: shulker lyrics <track_id>")
                sys.exit(1)
            asyncio.run(cmd_lyrics(args[1]))
        case "lib" | "library":
            asyncio.run(cmd_library())
        case _:
            # Treat anything else as a search
            asyncio.run(cmd_search(" ".join(args)))


if __name__ == "__main__":
    main()