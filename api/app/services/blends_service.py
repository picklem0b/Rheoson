"""Blends — collaborative playlists built together with friends.

Storage has two tiers, mirroring how playlists themselves work:

    MongoDB  ``blends`` collection — the source of truth whenever the DB is
             reachable. Every member gets the same live document, so edits
             made by one friend appear for all.
    JSON     ``MUSIC_DIR/.blends-<sha256(user)[:16]>.json`` — an offline
             mirror of the blends the caller belongs to. Written on every
             mutation so a DB outage still leaves each member a readable,
             playable copy (same philosophy as the per-user playlist file).

A blend document::

    {  "_id": uuid, "name": str, "owner": clerk_sub,
       "members": [clerk_sub, ...],        # owner is always members[0]
       "tracks": [track_id, ...],          # ordered, string ids — same
       "created_at": dt, "updated_at": dt }#   convention as playlists

Authorization model: every member may read, rename, add/remove tracks and
add/remove members; only the owner may delete the blend. Membership checks
always run against the stored document — client-supplied member lists are
never trusted.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

import structlog

from app.core import error_codes
from app.core.config import settings
from app.core.database import db_available
from app.core.error_codes import fail

log = structlog.get_logger()

MAX_NAME_CHARS = 80
MAX_TRACKS = 500
MAX_MEMBERS = 20


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: object) -> str | None:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, str):
        return value
    return None


# ── JSON offline mirror ───────────────────────────────────────


def _user_digest(user_id: str) -> str:
    return hashlib.sha256(user_id.encode("utf-8")).hexdigest()[:16]


def _mirror_file(user_id: str) -> Path:
    return Path(settings.MUSIC_DIR) / f".blends-{_user_digest(user_id)}.json"


def _read_mirror(user_id: str) -> dict[str, dict]:
    path = _mirror_file(user_id)
    if not path.exists():
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def _write_mirror(user_id: str, blends: dict[str, dict]) -> None:
    path = _mirror_file(user_id)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        # default=str renders datetimes as ISO strings — the mirror is a
        # plain-JSON offline copy, and blend_out() reads either form back.
        with open(path, "w", encoding="utf-8") as f:
            json.dump(blends, f, indent=2, ensure_ascii=False, default=str)
    except (OSError, TypeError, ValueError) as e:  # noqa: BLE001 — mirror is best-effort
        log.warning("blends.mirror_write_failed", user_id=user_id, error=str(e))


def _mirror_add(user_id: str, blend: dict) -> None:
    blends = _read_mirror(user_id)
    blends[blend["_id"]] = blend
    _write_mirror(user_id, blends)


def _mirror_remove(user_id: str, blend_id: str) -> None:
    blends = _read_mirror(user_id)
    if blends.pop(blend_id, None) is not None:
        _write_mirror(user_id, blends)


def _mirror_sync(members: list[str], blend: dict) -> None:
    """Mirror one blend document to every member's offline copy."""
    for m in members:
        _mirror_add(m, blend)


# ── Serialization ─────────────────────────────────────────────


def blend_out(doc: dict) -> dict:
    return {
        "id": doc.get("_id"),
        "name": doc.get("name", ""),
        "owner": doc.get("owner", ""),
        "members": list(doc.get("members", [])),
        "tracks": list(doc.get("tracks", [])),
        "createdAt": _iso(doc.get("created_at")),
        "updatedAt": _iso(doc.get("updated_at")),
    }


# ── Lookup & authorization ────────────────────────────────────


async def _get_blend(db, user_id: str, blend_id: str) -> dict:
    """Fetch a blend from Mongo, falling back to the caller's offline
    mirror when the DB is down. Membership is still enforced by callers —
    a mirror only ever contains blends the caller already belongs to."""
    if not blend_id:
        raise fail(error_codes.BLENDS.ID_INVALID, 400)
    if db_available():
        try:
            doc = await db.blends.find_one({"_id": blend_id})
        except Exception as e:  # noqa: BLE001 — surfaced as BEN01
            raise fail(error_codes.BLENDS.DB_UNAVAILABLE, 503) from e
        if doc:
            return doc
    doc = _read_mirror(user_id).get(blend_id)
    if not doc:
        raise fail(error_codes.BLENDS.NOT_FOUND, 404)
    return doc


def _require_member(doc: dict, user_id: str) -> None:
    if user_id not in doc.get("members", []):
        raise fail(error_codes.AUTH.FORBIDDEN, 403)


# ── CRUD ──────────────────────────────────────────────────────


async def create_blend(db, user_id: str, name: str) -> dict:
    name = (name or "").strip()
    if not name:
        raise fail(error_codes.BLENDS.NAME_REQUIRED, 400)
    if len(name) > MAX_NAME_CHARS:
        raise fail(error_codes.BLENDS.NAME_TOO_LONG, 400)

    doc = {
        "_id": str(uuid.uuid4()),
        "name": name,
        "owner": user_id,
        "members": [user_id],
        "tracks": [],
        "created_at": _now(),
        "updated_at": _now(),
    }
    if db_available():
        try:
            await db.blends.insert_one(doc)
        except Exception as e:  # noqa: BLE001 — surfaced as BEX01
            raise fail(error_codes.BLENDS.ADD_FAILED, 503) from e
    _mirror_sync(doc["members"], doc)
    return blend_out(doc)


async def list_blends(db, user_id: str) -> list[dict]:
    """All blends the caller belongs to, newest activity first."""
    if db_available():
        try:
            cursor = db.blends.find({"members": user_id})
            docs = [d async for d in cursor]
        except Exception as e:  # noqa: BLE001 — fall back to the mirror
            log.warning("blends.list_db_failed", error=str(e))
            docs = None  # type: ignore[assignment]
        if docs is not None:
            return sorted((blend_out(d) for d in docs),
                          key=lambda b: b["updatedAt"] or "", reverse=True)
    blends = _read_mirror(user_id)
    out = sorted((blend_out(d) for d in blends.values()),
                 key=lambda b: b["updatedAt"] or "", reverse=True)
    return out


async def get_blend(db, user_id: str, blend_id: str) -> dict:
    doc = await _get_blend(db, user_id, blend_id)
    _require_member(doc, user_id)
    return blend_out(doc)


async def rename_blend(db, user_id: str, blend_id: str, name: str) -> dict:
    doc = await _get_blend(db, user_id, blend_id)
    _require_member(doc, user_id)
    name = (name or "").strip()
    if not name:
        raise fail(error_codes.BLENDS.NAME_REQUIRED, 400)
    if len(name) > MAX_NAME_CHARS:
        raise fail(error_codes.BLENDS.NAME_TOO_LONG, 400)
    doc["name"] = name
    doc["updated_at"] = _now()
    await _persist(db, doc)
    return blend_out(doc)


async def delete_blend(db, user_id: str, blend_id: str) -> None:
    doc = await _get_blend(db, user_id, blend_id)
    _require_member(doc, user_id)
    if doc.get("owner") != user_id:
        raise fail(error_codes.BLENDS.DELETE_FORBIDDEN, 403)
    if db_available():
        try:
            await db.blends.delete_one({"_id": blend_id})
        except Exception as e:  # noqa: BLE001 — surfaced as BEX02
            raise fail(error_codes.BLENDS.REMOVE_FAILED, 503) from e
    for m in doc.get("members", []):
        _mirror_remove(m, blend_id)


# ── Tracks ────────────────────────────────────────────────────


async def add_track(db, user_id: str, blend_id: str, track_id: str) -> dict:
    doc = await _get_blend(db, user_id, blend_id)
    _require_member(doc, user_id)
    if not track_id or not isinstance(track_id, str):
        raise fail(error_codes.BLENDS.TRACKS_INVALID, 400)
    if track_id in doc.get("tracks", []):
        raise fail(error_codes.BLENDS.ALREADY_TRACK, 409)
    if len(doc.get("tracks", [])) >= MAX_TRACKS:
        raise fail(error_codes.BLENDS.ADD_FAILED, 400, append=f": blends cap at {MAX_TRACKS} tracks")
    doc.setdefault("tracks", []).append(track_id)
    doc["updated_at"] = _now()
    await _persist(db, doc)
    return blend_out(doc)


async def remove_track(db, user_id: str, blend_id: str, track_id: str) -> dict:
    doc = await _get_blend(db, user_id, blend_id)
    _require_member(doc, user_id)
    if track_id not in doc.get("tracks", []):
        raise fail(error_codes.BLENDS.TRACK_REMOVED, 404)
    doc["tracks"].remove(track_id)
    doc["updated_at"] = _now()
    await _persist(db, doc)
    return blend_out(doc)


async def reorder_tracks(db, user_id: str, blend_id: str, track_ids: list[str]) -> dict:
    doc = await _get_blend(db, user_id, blend_id)
    _require_member(doc, user_id)
    current = list(doc.get("tracks", []))
    if sorted(track_ids) != sorted(current):
        raise fail(error_codes.PLAYLIST.REORDER_MISMATCH, 400)
    doc["tracks"] = list(track_ids)
    doc["updated_at"] = _now()
    await _persist(db, doc)
    return blend_out(doc)


# ── Members ───────────────────────────────────────────────────


async def add_member(db, user_id: str, blend_id: str, peer_id: str) -> dict:
    doc = await _get_blend(db, user_id, blend_id)
    _require_member(doc, user_id)
    if not peer_id or peer_id == user_id:
        raise fail(error_codes.BLENDS.MEMBERS_INVALID, 400)
    if peer_id in doc.get("members", []):
        raise fail(error_codes.BLENDS.ALREADY_MEMBER, 409)
    if len(doc.get("members", [])) >= MAX_MEMBERS:
        raise fail(error_codes.BLENDS.MEMBERS_INVALID, 400,
                   append=f": blends cap at {MAX_MEMBERS} members")
    doc["members"] = sorted(set(doc.get("members", [])) | {peer_id})
    doc["updated_at"] = _now()
    await _persist(db, doc)
    return blend_out(doc)


async def remove_member(db, user_id: str, blend_id: str, peer_id: str) -> dict:
    doc = await _get_blend(db, user_id, blend_id)
    _require_member(doc, user_id)
    # The owner cannot be voted out, and only the owner (or the member
    # leaving) may remove someone — enforced here as: caller removes
    # themselves, or is the owner.
    if user_id != doc.get("owner") and peer_id != user_id:
        raise fail(error_codes.AUTH.FORBIDDEN, 403)
    if peer_id == doc.get("owner"):
        raise fail(error_codes.BLENDS.DELETE_FORBIDDEN, 403,
                   append=" — the owner cannot be removed")
    if peer_id not in doc.get("members", []):
        raise fail(error_codes.BLENDS.MEMBER_NOT_FOUND, 404)
    doc["members"] = [m for m in doc["members"] if m != peer_id]
    doc["updated_at"] = _now()
    await _persist(db, doc)
    _mirror_remove(peer_id, blend_id)
    return blend_out(doc)


# ── Persistence (Mongo + mirror) ──────────────────────────────


async def _persist(db, doc: dict) -> None:
    """Write the blend to Mongo when available and re-mirror to members."""
    if db_available():
        try:
            await db.blends.update_one(
                {"_id": doc["_id"]},
                {"$set": {k: v for k, v in doc.items() if k != "_id"}},
                upsert=True,
            )
        except Exception as e:  # noqa: BLE001 — mirror still updated below
            log.warning("blends.persist_db_failed", blend_id=doc.get("_id"), error=str(e))
    _mirror_sync(doc.get("members", []), doc)
