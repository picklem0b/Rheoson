"""Rename a downloaded song — file name and embedded title together.

A rename touches three things at once, and doing only one of them is what
leaves a library half-renamed:

* the file on disk,
* the embedded title tag (so players show the new name),
* the ``videoId → file`` identity map (its key is derived from the path, so a
  moved file must be re-recorded or ``isDownloaded`` goes stale for that
  track).

Used by hand on a single file, or to fix a batch of bad titles.
"""

from __future__ import annotations

from pathlib import Path

from app.services.metadata_service import read_track_metadata, write_tags

from cli import ui
from cli.library import find_files


def _new_stem(style: str, title: str, artist: str, old_stem: str) -> str:
    if style == "title-artist":
        return f"{title} - {artist}" if artist else title
    if style == "title":
        return title
    # artist-title is the download engine's default, so a rename lands on the
    # same convention a fresh download would have used.
    return f"{artist} - {title}" if artist else title


def _unique(path: Path) -> Path:
    """Never overwrite an existing file during a rename."""
    if not path.exists():
        return path
    counter = 1
    while True:
        candidate = path.with_name(f"{path.stem} ({counter}){path.suffix}")
        if not candidate.exists():
            return candidate
        counter += 1


def _rerecord_identity(old_path: Path, new_path: Path) -> None:
    """Point the videoId map at the renamed file (path-derived ids change)."""
    try:
        from app.services import track_identity
        from app.services.metadata_service import _file_id

        mapped = track_identity.lookup_by_file(_file_id(old_path))
        if not mapped or not mapped.get("video_id"):
            return
        new_id = _file_id(new_path)
        track_identity.record(
            video_id=mapped["video_id"],
            file_id=new_id,
            title=mapped.get("title", ""),
            artist=mapped.get("artist", ""),
            file_path=str(new_path),
        )
    except Exception:
        pass


def _refresh_m3u(folder: Path, old_name: str, new_name: str) -> None:
    """Repoint any sibling ``.m3u`` at the renamed file.

    Without this a rename inside a playlist folder leaves the playlist
    pointing at a file that no longer exists — playable in the app but
    broken in every external player that reads the ``.m3u``.
    """
    for m3u in folder.glob("*.m3u"):
        try:
            lines = m3u.read_text(encoding="utf-8").splitlines()
        except OSError:
            continue
        if old_name not in lines:
            continue
        m3u.write_text(
            "\n".join(new_name if line == old_name else line for line in lines) + "\n",
            encoding="utf-8",
        )


def cmd_rename(args) -> int:
    """``rheoson rename <file|query> <new title> [--artist NAME] [--tag-only]``"""
    query = " ".join(args.target).strip()
    new_title = " ".join(args.newname).strip()
    if not query or not new_title:
        ui.err("Usage: rename <file|query> <new title> [--artist NAME] [--tag-only] [--style artist-title]")
        return 1

    ui.blank()
    matches = find_files(query)
    if not matches:
        ui.err(f"No track matched '{query}'")
        ui.blank()
        return 1
    if len(matches) > 1 and not args.yes:
        ui.warn(f"{len(matches)} tracks match '{query}' — refine the query or pass an exact path:")
        for m in matches[:10]:
            ui.dim(str(m))
        ui.blank()
        return 1

    target = matches[0]
    ui.info(f"Renaming {ui.DIM}{target.name}{ui.R}")
    ui.sep()

    meta = read_track_metadata(target)
    artist = args.artist or (meta.get("artist") or {}).get("name", "")
    if artist == "Unknown Artist" and not args.artist:
        artist = ""
    style = args.style
    new_stem = _new_stem(style, new_title, artist, target.stem)

    # 1 — tags first, so a failure to move still leaves corrected metadata.
    try:
        write_tags(target, title=new_title, artist=(args.artist or None))
        ui.ok(f"Tagged title: {ui.B}{new_title}{ui.R}")
    except Exception as e:  # noqa: BLE001 — best-effort tagging
        ui.warn(f"Could not write tags: {e}")

    # 2 — the file itself (unless the caller only wanted tags).
    if args.tag_only:
        ui.dim("tag-only — file name left unchanged")
        ui.blank()
        return 0

    new_path = _unique(target.with_name(f"{new_stem}{target.suffix}"))
    try:
        target.rename(new_path)
    except OSError as e:
        ui.err(f"Could not rename file: {e}")
        ui.blank()
        return 1
    ui.ok(f"File: {ui.DIM}{target.name}{ui.R} → {ui.GR}{new_path.name}{ui.R}")

    # 3 — keep the identity map and any playlist pointing at the new path.
    _rerecord_identity(target, new_path)
    _refresh_m3u(new_path.parent, target.name, new_path.name)
    ui.blank()
    return 0
