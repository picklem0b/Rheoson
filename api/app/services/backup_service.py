"""Full-state export and restore.

The music itself is files on disk and travels on its own. What does not travel
is everything keyed to a user and stored *beside* the music: likes, hidden
tracks, play history, playlists and artist follows.

On a host with an ephemeral disk — Render's free tier, or any container that
gets replaced on deploy — those JSON files are the only copy that exists.
Losing them means losing the part of the app that took months to build, and
there is currently no way to move them to a new install.

The bundle is deliberately the stored shape rather than a tidied API shape: a
backup that needed a migration to restore would be a backup that fails the one
time it is actually needed. The format tag and version exist so a future change
can refuse a bundle it does not understand instead of half-applying it.
"""

from __future__ import annotations

from datetime import datetime, timezone

import structlog

from app.services import artist_follows
from app.services.local_history import (
    read_disliked_local,
    read_history_local,
    read_liked_local,
    restore_local_state,
)

log = structlog.get_logger()

FORMAT = "rheoson-backup"
FORMAT_VERSION = 1


async def export_state(user_id: str) -> dict:
    """Everything the user owns, in one document."""
    # Imported lazily: playlist_router imports this package's siblings, so a
    # module-level import would close the cycle at load time.
    from app.routers.playlist_router import _load as load_playlists

    return {
        "format": FORMAT,
        "version": FORMAT_VERSION,
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "liked": await read_liked_local(user_id),
        "disliked": await read_disliked_local(user_id),
        "history": await read_history_local(user_id),
        "playlists": load_playlists(user_id),
        "follows": await artist_follows.list_follows(user_id),
    }


def _validate(payload: dict) -> None:
    """Reject a bundle we cannot faithfully apply."""
    if not isinstance(payload, dict):
        raise ValueError("Backup must be a JSON object")
    fmt = payload.get("format")
    if fmt and fmt != FORMAT:
        raise ValueError(f"Not a Rheoson backup (format: {fmt})")
    version = payload.get("version")
    if isinstance(version, int) and version > FORMAT_VERSION:
        raise ValueError(
            f"Backup was made by a newer version (v{version}); this server understands v{FORMAT_VERSION}"
        )


async def restore_state(user_id: str, payload: dict, *, merge: bool = True) -> dict:
    """Apply a bundle. Returns what was stored, per section.

    `merge` unions with existing state; `merge=False` replaces it. Both are
    reported back so the caller can tell the user what actually happened rather
    than just "done".
    """
    _validate(payload)

    counts = await restore_local_state(
        user_id,
        liked=payload.get("liked") if isinstance(payload.get("liked"), list) else None,
        disliked=(
            payload.get("disliked") if isinstance(payload.get("disliked"), list) else None
        ),
        history=(
            payload.get("history") if isinstance(payload.get("history"), list) else None
        ),
        merge=merge,
    )

    stored_playlists = 0
    incoming_playlists = payload.get("playlists")
    if isinstance(incoming_playlists, dict) and incoming_playlists:
        from app.routers.playlist_router import _load as load_playlists
        from app.routers.playlist_router import _save as save_playlists

        current = load_playlists(user_id) if merge else {}
        # A restored playlist must not clobber an existing one with the same id
        # when merging — the local copy is the one the user has been editing.
        for pid, pl in incoming_playlists.items():
            if not isinstance(pl, dict):
                continue
            if merge and str(pid) in current:
                continue
            current[str(pid)] = pl
        save_playlists(user_id, current)
        stored_playlists = len(current)

    stored_follows = 0
    incoming_follows = payload.get("follows")
    if isinstance(incoming_follows, list):
        stored_follows = await artist_follows.restore_follows(
            user_id, incoming_follows, merge=merge
        )

    result = {
        "merged": merge,
        **counts,
        "playlists": stored_playlists,
        "follows": stored_follows,
    }
    log.info("backup.restored", user_id=user_id[:8], **{k: v for k, v in result.items() if k != "merged"})
    return result
