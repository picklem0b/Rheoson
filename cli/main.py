"""Rheoson CLI entry point — command dispatch and the interactive shell.

The CLI reuses the server's services directly, so it works with no uvicorn
running. The one thing that still needs the server is *streaming* (the audio
route lives there); ``stream`` prints the URL for that.
"""

from __future__ import annotations

import argparse
import asyncio
import re
import sys
from pathlib import Path

from cli import ui

_YT_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


def _version() -> str:
    """The api version, read from pyproject without importing the app."""
    try:
        pyproject = Path(__file__).resolve().parent.parent / "api" / "pyproject.toml"
        for line in pyproject.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("version"):
                return line.split("=", 1)[1].strip().strip('"')
    except Exception:
        pass
    return "?"


# ── Simple commands ───────────────────────────────────────────


async def cmd_search(args) -> int:
    from app.services import search_service

    query = " ".join(args.query).strip()
    if not query:
        ui.err("Usage: search <query>")
        return 1
    ui.blank()
    ui.info(f"Searching: {ui.B}{query}{ui.R}")
    ui.sep()
    try:
        result = await search_service.search(query, filter=args.filter)
    except Exception as e:  # noqa: BLE001
        ui.err(f"Search failed: {e}")
        ui.blank()
        return 1

    tracks = result.get("tracks", [])
    artists = result.get("artists", [])
    albums = result.get("albums", [])
    playlists = result.get("playlists", [])

    if tracks:
        ui.section("Tracks", len(tracks))
        for i, t in enumerate(tracks[:10]):
            ui.track(t, i)
    if artists:
        ui.section("Artists", len(artists))
        for a in artists[:5]:
            print(f"     {ui.MG}{ui.B}{a.get('name')}{ui.R}  {ui.DIM}{a.get('id')}{ui.R}")
    if albums:
        ui.section("Albums", len(albums))
        for al in albums[:5]:
            artist = (al.get("artist") or {}).get("name", "")
            print(f"     {ui.BL}{ui.B}{al.get('title')}{ui.R}  {ui.DIM}{artist}{ui.R}")
    if playlists:
        ui.section("Playlists", len(playlists))
        for pl in playlists[:5]:
            print(f"     {ui.CY}{ui.B}{pl.get('title')}{ui.R}  {ui.DIM}{pl.get('trackCount')} tracks{ui.R}")

    if not any([tracks, albums, artists, playlists]):
        ui.err(f"No results for '{query}'")
    ui.blank()
    return 0


async def cmd_resolve(args) -> int:
    from app.services import search_service

    url = args.url.strip()
    ui.blank()
    ui.info(f"Resolving: {ui.DIM}{url}{ui.R}")
    ui.sep()
    try:
        result = await search_service.resolve_url(url)
    except Exception as e:  # noqa: BLE001
        ui.err(f"Failed: {e}")
        ui.blank()
        return 1
    tracks = result.get("tracks", [])
    ui.dim(f"type: {result.get('type', 'unknown')}   {len(tracks)} tracks")
    for i, t in enumerate(tracks[:20]):
        ui.track(t, i)
    if not tracks:
        ui.err("No tracks found")
    ui.blank()
    return 0


async def cmd_dl(args) -> int:
    from cli.download import download_one, playlist_dir

    target = " ".join(args.target).strip()
    if not target:
        ui.err("Usage: dl <query|url> [--playlist NAME] [--dest DIR]")
        return 1

    ui.blank()
    is_url = target.startswith("http")
    dest = None
    if args.playlist:
        dest = playlist_dir(args.playlist)
    elif args.dest:
        dest = Path(args.dest).expanduser()

    if is_url or _YT_ID.match(target):
        ui.info(f"Downloading: {ui.B}{target}{ui.R}")
        job = await download_one(
            url=target if is_url else None,
            track_id=None if is_url else target,
            fmt=args.format,
            quality=args.quality,
            save_lrc=args.lyrics,
            dest_dir=dest,
        )
    else:
        # A bare phrase resolves through a YouTube Music search, taking the
        # top hit the way the original CLI did.
        from app.services.ytmusic_service import search_one

        ui.info("Searching for best match…")
        found = await search_one(target)
        if not found:
            ui.err("No results found")
            ui.blank()
            return 1
        ui.ok(f"Found: {ui.B}{found.get('title')}{ui.R}  {ui.DIM}{(found.get('artist') or {}).get('name')}{ui.R}")
        job = await download_one(
            track_id=found.get("youtubeId") or found.get("id"),
            fmt=args.format,
            quality=args.quality,
            save_lrc=args.lyrics,
            dest_dir=dest,
        )

    ui.blank()
    if job.get("status") == "done":
        ui.ok(f"Saved {ui.GR}{job.get('filePath', '')}{ui.R}")
    elif job:
        ui.err(f"Failed: {job.get('error', 'unknown error')}")
        return 1
    ui.blank()
    return 0


async def cmd_downloads(args) -> int:
    from app.services.download_service import get_all_jobs
    from cli.download import CLI_OWNER

    ui.blank()
    ui.info("CLI download jobs")
    ui.sep()
    jobs = get_all_jobs(owner=CLI_OWNER)
    if not jobs:
        ui.dim("No downloads yet.")
        ui.blank()
        return 0
    rows = []
    for j in jobs:
        rows.append(
            [
                j.get("id", "")[:8],
                ui.truncate(j.get("title") or j.get("trackId") or "—", 35),
                j.get("status", ""),
                f"{float(j.get('progress') or 0):.0f}%",
            ]
        )
    ui.table(rows, ["ID", "TITLE", "STATUS", "PROGRESS"])
    ui.blank()
    return 0


async def cmd_status(args) -> int:
    from app.services.download_service import get_job
    from cli.download import CLI_OWNER

    job = get_job(args.job_id, owner=CLI_OWNER)
    ui.blank()
    if not job:
        ui.err(f"No job {args.job_id}")
        ui.blank()
        return 1
    ui.title("Job")
    ui.dim(f"id      : {job.get('id')}")
    ui.dim(f"title   : {job.get('title', '—')}")
    ui.dim(f"artist  : {job.get('artist', '—')}")
    print(f"  {ui.B}status  :{ui.R} {ui.status_colour(job.get('status', ''))}")
    ui.dim(f"progress: {float(job.get('progress') or 0):.1f}%")
    if job.get("filePath"):
        ui.ok(f"saved at: {job['filePath']}")
    if job.get("error"):
        ui.err(job["error"])
    ui.blank()
    return 0


async def cmd_cancel(args) -> int:
    from app.services.download_service import cancel_job
    from cli.download import CLI_OWNER

    ui.blank()
    if await cancel_job(args.job_id, owner=CLI_OWNER):
        ui.ok(f"Cancelled: {args.job_id}")
        ui.blank()
        return 0
    ui.err(f"No job {args.job_id}")
    ui.blank()
    return 1


async def cmd_stream(args) -> int:
    from app.core.config import settings

    base = f"http://127.0.0.1:{settings.API_PORT}/api"
    ui.blank()
    ui.ok("Stream URL (needs the server running):")
    print(f"\n  {ui.CY}{base}/stream/{args.track_id}/audio{ui.R}\n")
    ui.dim("Copy this into any media player (VLC, mpv, …)")
    ui.blank()
    return 0


async def cmd_health(args) -> int:
    import httpx

    from app.core.config import settings
    from app.core import toolchain

    ui.blank()
    ui.info("Local readiness")
    ui.sep()
    ui.dim(f"version  : {_version()}")
    ui.dim(f"env      : {settings.ENV}")
    ui.dim(f"music    : {settings.MUSIC_DIR}")
    ui.dim(f"downloads: {settings.DOWNLOADS_DIR}")
    ui.dim(f"yt-dlp   : {toolchain.ytdlp().path or 'missing'}")
    ui.dim(f"ffmpeg   : {toolchain.ffmpeg().path or 'missing'}")

    if args.api:
        base = f"http://127.0.0.1:{settings.API_PORT}/api"
        ui.blank()
        ui.info(f"Pinging server at {base} …")
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                r = await client.get(f"{base}/health")
                r.raise_for_status()
                body = r.json()
            ui.ok(f"API online — version {body.get('version', '?')}")
        except Exception as e:  # noqa: BLE001
            ui.err(f"API unreachable — {e}")
    ui.blank()
    return 0


async def cmd_playlist(args) -> int:
    from cli.playlist import cmd_playlist

    return await cmd_playlist(args)


async def cmd_csv(args) -> int:
    from cli.csvimport import cmd_csv

    return await cmd_csv(args)


async def cmd_lyrics(args) -> int:
    from cli.lyrics import cmd_lyrics

    return await cmd_lyrics(args)


# ── Parser ────────────────────────────────────────────────────


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="rheoson",
        description="Rheoson CLI — search, download, lyrics and playlists from the terminal.",
    )
    parser.add_argument("--version", action="version", version=f"rheoson {_version()}")
    sub = parser.add_subparsers(dest="command")

    p = sub.add_parser("search", help="search YouTube Music")
    p.add_argument("query", nargs="+")
    p.add_argument("--filter", choices=["songs", "albums", "artists", "playlists"], default=None)

    p = sub.add_parser("resolve", help="resolve any music URL")
    p.add_argument("url")

    p = sub.add_parser("dl", aliases=["download"], help="download a track (query, id or URL)")
    p.add_argument("target", nargs="+")
    p.add_argument("--format", default="mp3")
    p.add_argument("--quality", default="320")
    p.add_argument("--playlist", default=None, help="place the file under downloads/<name>/")
    p.add_argument("--dest", default=None, help="explicit destination directory")
    p.add_argument("--lyrics", action="store_true", help="save a .lrc beside the file")

    p = sub.add_parser("playlist", help="download a playlist into downloads/<name>/")
    p.add_argument("url")
    p.add_argument("--name", default=None)
    p.add_argument("--format", default="mp3")
    p.add_argument("--quality", default="320")
    p.add_argument("--no-lyrics", action="store_true", help="skip .lrc sidecars")

    p = sub.add_parser("csv", help="import an Exportify CSV as a playlist")
    p.add_argument("file")
    p.add_argument("--name", default=None)
    p.add_argument("--format", default="mp3")
    p.add_argument("--quality", default="320")
    p.add_argument("--limit", type=int, default=0, help="only the first N tracks")
    p.add_argument("--dry-run", action="store_true", help="resolve and preview without downloading")
    p.add_argument("--no-lyrics", action="store_true")

    p = sub.add_parser("lyrics", help="fetch lyrics; optionally save/embed")
    p.add_argument("target", nargs="+")
    p.add_argument("--save", action="store_true", help="write a .lrc beside the file")
    p.add_argument("--embed", action="store_true", help="embed lyrics into the audio tags")

    p = sub.add_parser("rename", help="rename a downloaded song (file + tags)")
    p.add_argument("target", nargs="+", help="file path or a search query")
    p.add_argument("newname", nargs="+", help="the new title")
    p.add_argument("--artist", default=None, help="also set the artist tag")
    p.add_argument("--tag-only", action="store_true", help="update tags, leave the file name")
    p.add_argument("--style", choices=["artist-title", "title", "title-artist"], default="artist-title")
    p.add_argument("--yes", action="store_true", help="pick the first match when several match")

    p = sub.add_parser("library", help="list the local library")
    p.add_argument("--playlists", action="store_true", help="list playlist folders instead")
    p.add_argument("--music-only", action="store_true", help="exclude the downloads folder")

    p = sub.add_parser("downloads", aliases=["dls"], help="list CLI download jobs")
    p = sub.add_parser("status", help="show one job")
    p.add_argument("job_id")
    p = sub.add_parser("cancel", help="cancel one job")
    p.add_argument("job_id")
    p = sub.add_parser("stream", help="print the stream URL for a track id")
    p.add_argument("track_id")

    p = sub.add_parser("health", help="local readiness (and optionally the server)")
    p.add_argument("--api", action="store_true", help="also ping the running server")

    p = sub.add_parser("setup", help="install and verify ffmpeg + yt-dlp")
    p = sub.add_parser("tools", help="show toolchain versions")
    p.add_argument("--upgrade", action="store_true", help="update yt-dlp first")

    p = sub.add_parser("clear", help="clear the screen")
    return parser


async def dispatch(args) -> int:
    cmd = args.command
    handlers = {
        "search": cmd_search,
        "resolve": cmd_resolve,
        "dl": cmd_dl,
        "download": cmd_dl,
        "playlist": cmd_playlist,
        "csv": cmd_csv,
        "lyrics": cmd_lyrics,
        "downloads": cmd_downloads,
        "dls": cmd_downloads,
        "status": cmd_status,
        "cancel": cmd_cancel,
        "stream": cmd_stream,
        "health": cmd_health,
        "library": None,  # sync
        "rename": None,   # sync
        "setup": None,    # sync
        "tools": None,    # sync
        "clear": None,    # sync
    }
    handler = handlers.get(cmd)
    if handler is not None:
        return await handler(args)

    # Sync handlers.
    if cmd == "library":
        from cli.library import cmd_library

        return cmd_library(args)
    if cmd == "rename":
        from cli.rename import cmd_rename

        return cmd_rename(args)
    if cmd == "setup":
        from cli.tools import cmd_setup

        return cmd_setup(args)
    if cmd == "tools":
        from cli.tools import cmd_tools

        return cmd_tools(args)
    if cmd == "clear":
        print("\033[2J\033[H", end="")
        return 0

    ui.err(f"Unknown command: {cmd}")
    return 1


# ── Interactive shell ─────────────────────────────────────────

def _help_text() -> str:
    g, r, b = ui.GR, ui.R, ui.B
    rows = [
        ("search", "<query>", "Search YouTube Music"),
        ("resolve", "<url>", "Resolve any music URL"),
        ("dl", "<query|url>", "Download a track"),
        ("playlist", "<url>", "Download a playlist to downloads/<name>/"),
        ("csv", "<file.csv>", "Import an Exportify CSV as a playlist"),
        ("lyrics", "<id|query>", "Show lyrics (--save / --embed)"),
        ("rename", "<query> <title>", "Rename a downloaded song"),
        ("lib", "", "Browse the local library"),
        ("pls", "", "List playlist folders"),
        ("dls", "", "List CLI download jobs"),
        ("status", "<job_id>", "Show a job"),
        ("cancel", "<job_id>", "Cancel a job"),
        ("stream", "<track_id>", "Print a stream URL"),
        ("health", "", "Local readiness"),
        ("setup", "", "Install/verify ffmpeg + yt-dlp"),
        ("tools", "", "Toolchain versions"),
        ("clear", "", "Clear screen"),
        ("quit", "", "Exit"),
    ]
    lines = [f"\n  {b}Commands:{r}"]
    for name, arg, desc in rows:
        lines.append(f"  {g}{name:<9}{r}{arg:<18} {desc}")
    return "\n".join(lines) + "\n"


_HELP = _help_text()


def repl() -> int:
    parser = build_parser()
    ui.header()
    print(f"  {ui.DIM}Type a command or 'help'. Ctrl+C to exit.{ui.R}\n")
    while True:
        try:
            raw = input(ui.prompt()).strip()
        except (KeyboardInterrupt, EOFError):
            print(f"\n\n  {ui.DIM}bye.{ui.R}\n")
            return 0
        if not raw:
            continue
        parts = raw.split()
        cmd = parts[0].lower()

        if cmd in ("quit", "exit", "q"):
            print(f"\n  {ui.DIM}bye.{ui.R}\n")
            return 0
        if cmd == "help":
            print(_HELP)
            continue
        # Friendly aliases for the shell only.
        if cmd == "lib":
            raw = "library " + " ".join(parts[1:])
        elif cmd == "pls":
            raw = "library --playlists"
        elif cmd == "dls":
            raw = "downloads"
        elif cmd == "clear":
            print("\033[2J\033[H", end="")
            continue

        try:
            args = parser.parse_args(raw.split())
        except SystemExit:
            continue
        if not getattr(args, "command", None):
            continue
        try:
            asyncio.run(dispatch(args))
        except KeyboardInterrupt:
            print()
        except Exception as e:  # noqa: BLE001 — never let the shell die
            ui.err(f"Error: {e}")


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    if not argv:
        return repl()

    parser = build_parser()
    args = parser.parse_args(argv)
    if not getattr(args, "command", None):
        parser.print_help()
        return 1
    try:
        return asyncio.run(dispatch(args))
    except KeyboardInterrupt:
        print(f"\n  {ui.DIM}cancelled.{ui.R}\n")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
