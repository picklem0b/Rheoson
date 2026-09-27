"""Messaging service — direct messages with rich music shares.

Storage (MongoDB only — messaging is a social feature and dies without it):

    conversations  {_id: "<sha256(sorted pair)[:24]>", members: [a, b],
                    updated_at}
    messages       {_id: uuid4, conversation_id, sender_id, kind, text,
                    payload, created_at}

Conversation ids are derived from the sorted member pair, so two users can
never end up with two parallel threads, and every read/write re-verifies
membership by recomputing that id from the authenticated caller — the peer
id supplied by a client is never trusted as authorization.

Delivery is dual-path by design: the Socket.IO `message:send` event gives
the sub-second path, while POST /api/messages/send always works so a client
with a dead socket still sends (the receiving side picks it up on their
next conversations poll or socket reconnect). Both funnel through
``send_message`` — one validation surface, one rate limiter.

Presence (who is listening to what) is NOT stored here: it rides the
existing ``player:state`` relay in ``app.websocket.ws_events``. This module
only owns message data and peer profiles.
"""

from __future__ import annotations

import hashlib
import json
import time
import uuid
from datetime import datetime, timezone

import structlog

from app.core import error_codes
from app.core.error_codes import fail

log = structlog.get_logger()

# ── Constants ─────────────────────────────────────────────────

MAX_MESSAGE_CHARS = 2000
MAX_PAYLOAD_BYTES = 8 * 1024
MAX_MESSAGES_PAGE = 100
DEFAULT_MESSAGES_PAGE = 50

#: Kinds a share can carry. "text" is the plain chat bubble; everything
#: else renders as a tappable music card in the client.
SHARE_KINDS = frozenset({"text", "track", "lyrics", "playlist", "album", "artist", "blend"})

# ── Rate limiting (sliding window, in-process) ────────────────
#
# 30 messages / 60 s per sender is far above human chat cadence and low
# enough that a runaway client cannot flood a peer's socket. In-process is
# correct for a single-instance deployment; if Rheoson ever runs several
# API replicas this moves to Redis.

_WINDOW_SECONDS = 60.0
_WINDOW_LIMIT = 30
_send_times: dict[str, list[float]] = {}


def _reset_rate_limit() -> None:
    """Test hook — the window state must not leak between tests."""
    _send_times.clear()


def _check_rate_limit(user_id: str) -> None:
    now = time.monotonic()
    stamps = [t for t in _send_times.get(user_id, ()) if now - t < _WINDOW_SECONDS]
    if len(stamps) >= _WINDOW_LIMIT:
        raise fail(error_codes.MESSAGING.RATE_LIMITED, 429)
    stamps.append(now)
    _send_times[user_id] = stamps


# ── Conversation identity ─────────────────────────────────────


def conversation_id(user_a: str, user_b: str) -> str:
    """Deterministic DM id from the sorted member pair.

    A conversation between A and B is the same document no matter who
    opened it first — and because every route recomputes this from the
    authenticated caller + the requested peer, a client can never read or
    write a thread it does not belong to.
    """
    pair = "|".join(sorted([user_a, user_b]))
    return hashlib.sha256(pair.encode("utf-8")).hexdigest()[:24]


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Peer profiles ─────────────────────────────────────────────


async def peer_info(db, user_id: str) -> dict:
    """Display info for one user, or a placeholder when they are unknown.

    Peer documents live in Mongo ``users`` (synced by the Clerk webhook):
    ``_id`` is the Clerk sub, plus ``username`` / ``image_url``. Unknown
    ids (deleted accounts, malformed shares) degrade to a placeholder
    instead of failing the whole conversation list.
    """
    try:
        doc = await db.users.find_one({"_id": user_id}, {"username": 1, "image_url": 1})
    except Exception:  # noqa: BLE001 — a profile read must never break a chat list
        doc = None
    if not doc:
        return {"id": user_id, "username": "Rheoson user", "image_url": ""}
    return {
        "id": user_id,
        "username": doc.get("username") or "Rheoson user",
        "image_url": doc.get("image_url") or "",
    }


async def search_users(db, me_id: str, query: str, limit: int = 10) -> list[dict]:
    """Username search for the "new chat" and "add to blend" pickers.

    Prefix-anchored (not substring) so typing two letters doesn't dump the
    whole instance, and self is excluded — you cannot DM yourself.
    """
    q = (query or "").strip()
    if not q:
        return []
    limit = max(1, min(int(limit), 20))
    try:
        cursor = db.users.find(
            {"_id": {"$ne": me_id}, "username": {"$regex": f"^{_escape_regex(q)}", "$options": "i"}},
        ).limit(limit)
        docs = [d async for d in cursor]
    except Exception:  # noqa: BLE001 — search must degrade, not 500
        log.warning("messaging.user_search_failed")
        return []
    out = []
    for d in docs:
        out.append({
            "id": d.get("_id"),
            "username": d.get("username") or "Rheoson user",
            "image_url": d.get("image_url") or "",
        })
    return out


def _escape_regex(s: str) -> str:
    for ch in "\\^$.|?*+()[]{}":
        s = s.replace(ch, f"\\{ch}")
    return s


# ── Conversations ─────────────────────────────────────────────


async def get_or_create_conversation(db, me_id: str, peer_id: str) -> dict:
    """Fetch (or open) the DM thread between the caller and a peer."""
    if not peer_id or peer_id == me_id:
        raise fail(error_codes.MESSAGING.CONVERSATION_INVALID, 400)
    cid = conversation_id(me_id, peer_id)
    doc = await db.conversations.find_one({"_id": cid})
    if doc is None:
        doc = {
            "_id": cid,
            "members": sorted([me_id, peer_id]),
            "updated_at": _now(),
        }
        await db.conversations.insert_one(doc)
    return {
        "id": cid,
        "members": doc.get("members", []),
        "updatedAt": _iso(doc.get("updated_at")),
    }


async def list_conversations(db, me_id: str, limit: int = 30) -> list[dict]:
    """The caller's threads, most recently active first, with a preview.

    One Mongo query pulls candidate conversations (membership via the
    members array); peers and last messages are then fetched per thread —
    fine for a personal instance where a user has dozens of threads, not
    thousands.
    """
    try:
        cursor = db.conversations.find({"members": me_id}).limit(limit)
        docs = [d async for d in cursor]
    except Exception as e:  # noqa: BLE001 — surfaced as MEN01
        raise fail(error_codes.MESSAGING.SERVICE_UNAVAILABLE, 503) from e

    peer_ids = []
    for d in docs:
        for m in d.get("members", []):
            if m != me_id:
                peer_ids.append(m)
    peers = {p["id"]: p for p in [await peer_info(db, pid) for pid in dict.fromkeys(peer_ids)]}

    out = []
    for d in docs:
        peer_id = next((m for m in d.get("members", []) if m != me_id), "")
        last = await _last_message(db, d["_id"])
        out.append({
            "id": d["_id"],
            "peer": peers.get(peer_id, {"id": peer_id, "username": "Rheoson user", "image_url": ""}),
            "lastMessage": last,
            "updatedAt": _iso(d.get("updated_at")),
        })
    out.sort(key=lambda c: c["updatedAt"], reverse=True)
    return out


async def _last_message(db, conversation_id: str) -> dict | None:
    """Newest message in a thread. Messages are inserted chronologically,
    so the last document the cursor yields is the newest — no sort needed,
    which keeps this correct on both Motor and the test mock."""
    try:
        last = None
        async for m in db.messages.find({"conversation_id": conversation_id}):
            last = m
    except Exception:  # noqa: BLE001 — a missing preview must not hide the thread
        return None
    return _message_out(last) if last else None


# ── Messages ──────────────────────────────────────────────────


def _validate_share(kind: str, text: str | None, payload: dict | None) -> tuple[str, str, dict]:
    if kind not in SHARE_KINDS:
        raise fail(error_codes.MESSAGING.SHARE_INVALID, 400)
    body = (text or "").strip()
    if kind == "text" and not body:
        raise fail(error_codes.MESSAGING.MESSAGE_EMPTY, 400)
    if len(body) > MAX_MESSAGE_CHARS:
        raise fail(error_codes.MESSAGING.MESSAGE_TOO_LONG, 400)
    share = payload or {}
    if not isinstance(share, dict):
        raise fail(error_codes.MESSAGING.SHARE_INVALID, 400)
    if share:
        try:
            size = len(json.dumps(share, default=str))
        except (TypeError, ValueError):
            raise fail(error_codes.MESSAGING.SHARE_INVALID, 400) from None
        if size > MAX_PAYLOAD_BYTES:
            raise fail(error_codes.MESSAGING.SHARE_INVALID, 400)
    return kind, body, share


async def send_message(db, sender_id: str, peer_id: str, kind: str = "text",
                       text: str | None = None, payload: dict | None = None) -> dict:
    """Persist one message and touch the conversation. Raises DCCNN codes."""
    _check_rate_limit(sender_id)
    if not peer_id or peer_id == sender_id:
        raise fail(error_codes.MESSAGING.CONVERSATION_INVALID, 400)
    kind, body, share = _validate_share(kind, text, payload)

    cid = conversation_id(sender_id, peer_id)
    msg = {
        "_id": str(uuid.uuid4()),
        "conversation_id": cid,
        "sender_id": sender_id,
        "kind": kind,
        "text": body,
        "payload": share,
        "created_at": _now(),
    }
    try:
        await db.messages.insert_one(msg)
        await db.conversations.update_one(
            {"_id": cid, "members": sorted([sender_id, peer_id])},
            {"$set": {"members": sorted([sender_id, peer_id]), "updated_at": _now()}},
            upsert=True,
        )
    except Exception as e:  # noqa: BLE001 — surfaced as MEX01
        raise fail(error_codes.MESSAGING.SEND_FAILED, 503) from e
    return _message_out(msg)


async def list_messages(db, me_id: str, peer_id: str, limit: int = DEFAULT_MESSAGES_PAGE,
                        before: str | None = None) -> list[dict]:
    """One page of a thread, oldest → newest. Membership is re-derived."""
    if not peer_id or peer_id == me_id:
        raise fail(error_codes.MESSAGING.CONVERSATION_INVALID, 400)
    limit = max(1, min(int(limit), MAX_MESSAGES_PAGE))
    cid = conversation_id(me_id, peer_id)

    try:
        cursor = db.messages.find({"conversation_id": cid}).limit(limit * 4 + 200)
        docs = []
        async for m in cursor:
            docs.append(m)
    except Exception as e:  # noqa: BLE001 — surfaced as MEN01
        raise fail(error_codes.MESSAGING.SERVICE_UNAVAILABLE, 503) from e

    docs.sort(key=lambda m: _iso(m.get("created_at")) or "", reverse=True)
    if before:
        docs = [m for m in docs if (_iso(m.get("created_at")) or "") < before]
    docs = docs[:limit]
    docs.reverse()
    return [_message_out(m) for m in docs]


def _message_out(m: dict) -> dict:
    return {
        "id": m.get("_id"),
        "conversationId": m.get("conversation_id"),
        "senderId": m.get("sender_id"),
        "kind": m.get("kind", "text"),
        "text": m.get("text", ""),
        "payload": m.get("payload") or {},
        "createdAt": _iso(m.get("created_at")),
    }


def _iso(value: object) -> str | None:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, str):
        return value
    return None


# ── Presence (reads ws_events state — never stored here) ──────


def listening_line(state: dict | None) -> str | None:
    """Human summary for a presence entry: "{title} — {artist}" or None."""
    if not state:
        return None
    track = state.get("currentTrack")
    if not track or not state.get("isPlaying"):
        return None
    title = (track.get("title") or "").strip()
    if not title:
        return None
    artist = (track.get("artist") or "").strip()
    return f"{title} — {artist}" if artist else title


def presence_snapshot(sids: dict[str, str], player_state: dict[str, dict],
                      profiles: dict[str, dict]) -> list[dict]:
    """Who is connected right now and what they are playing.

    ``trackId`` rides along so the client can make a "{user} listening to
    {song}" chip tappable — tap it, the track is resolved and played.

    Pure function over the websocket layer's live maps so the REST route
    and the socket ``presence:list`` ack return exactly the same shape.
    """
    seen: dict[str, dict] = {}
    for _sid, uid in sids.items():
        if uid in seen:
            continue
        profile = profiles.get(uid, {})
        state = player_state.get(uid) or {}
        track = (state.get("currentTrack") or {}) if isinstance(state, dict) else {}
        seen[uid] = {
            "userId": uid,
            "username": profile.get("username") or "Rheoson user",
            "imageUrl": profile.get("image_url") or "",
            "listeningTo": listening_line(state),
            "isPlaying": bool(state.get("isPlaying")),
            "trackId": (track.get("id") or None) if isinstance(track, dict) else None,
        }
    return sorted(seen.values(), key=lambda u: (u["username"], u["userId"]))
