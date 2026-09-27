"""Socket.IO event handlers.

In addition to connect/disconnect/ping this module implements cross-device
player sync:

  * The client sends its Clerk JWT in the socket auth handshake
    (`io(url, { auth: { token } })`). The connect handler verifies it and
    remembers sid → user_id.
  * `player:state` from one of the user's devices is stored per-user
    (latest wins) and relayed to their OTHER devices (skip_sid).
  * On connect, the stored state is replayed to the new device so it
    snaps into sync immediately.

If the token is missing/invalid the connection still works (download
progress etc. is broadcast) but player sync is skipped — there is no
identity to scope it to.

NOTE: No application-level heartbeat here. python-socketio's engine.io
already pings/drops dead connections at the protocol level.
"""

import structlog

log = structlog.get_logger()

# sid → user_id for authenticated sockets
_sid_users: dict[str, str] = {}
# user_id → latest player state (single-source snapshot per account)
_player_state: dict[str, dict] = {}
# Profiles cache for presence lines, refreshed by the messaging router's
# /presence poll and presence broadcasts. Keyed by user id.
_profiles: dict[str, dict] = {}


def remember_profile(user_id: str, profile: dict) -> None:
    """Cache a user's display info for presence broadcasts.

    Called from the REST presence route (which already resolved profiles
    from Mongo); the socket layer never queries Mongo itself.
    """
    if user_id and isinstance(profile, dict):
        _profiles[user_id] = profile


def presence_users() -> list[dict]:
    """Connected users with their live "listening to" line."""
    from app.services import messaging_service as ms
    return ms.presence_snapshot(_sid_users, _player_state, _profiles)


def sids_snapshot() -> dict[str, str]:
    """Copy of the live sid → user_id map for read-only consumers."""
    return dict(_sid_users)


async def _user_for_sid(sid: str) -> str | None:
    return _sid_users.get(sid)


async def _broadcast_presence(sio) -> None:
    """Push the presence snapshot to every authenticated socket.

    Called on connect/disconnect and whenever a player state changes —
    the two moments when "who is listening to what" can change. Payload
    is tiny (a handful of users), so broadcasting on every change is fine
    at personal-instance scale.
    """
    try:
        await sio.emit("presence", {"users": presence_users()})
    except Exception as e:
        log.warning("ws.presence.emit.failed", error=str(e))


def register_events(sio) -> None:
    """Register all Socket.IO event handlers on the sio instance."""

    @sio.event
    async def connect(sid, environ, auth):
        user_id: str | None = None
        try:
            token = (auth or {}).get("token") or ""
            if token:
                from app.core.deps import verify_clerk_token
                claims = await verify_clerk_token(token)
                if claims and claims.get("sub"):
                    user_id = claims["sub"]
        except Exception as e:
            log.warning("ws.auth.failed", sid=sid, error=str(e))

        if user_id:
            _sid_users[sid] = user_id
            log.info("ws.connect", sid=sid, user_id=user_id)
            # Replay the account's latest player state to the new device
            stored = _player_state.get(user_id)
            if stored:
                await sio.emit("player:state", stored, room=sid)
            # Tell everyone the user list changed (join/leave/now-playing)
            await _broadcast_presence(sio)
        else:
            log.info("ws.connect.anon", sid=sid)

    @sio.event
    async def disconnect(sid):
        user_id = _sid_users.pop(sid, None)
        log.info("ws.disconnect", sid=sid, user_id=user_id)
        if user_id:
            await _broadcast_presence(sio)

    @sio.event
    async def ping(sid, data):
        await sio.emit("pong", {"sid": sid}, room=sid)

    # ── Messaging (the fast path) ───────────────────────────────

    @sio.event
    async def message_send(sid, data):
        """Sub-second message delivery over the existing socket.

        The client emits ``message:send`` (Socket.IO maps event names to
        snake_case handlers). The message is persisted through the same
        service call the REST route uses — one validation surface, one
        rate limiter, one set of DCCNN codes — then delivered:

        * to the sender:   ``message:ack``  (confirms + carries the id)
        * to the receiver: ``message:new``  (every device they have online)

        Errors come back as ``message:error`` on the sender's socket so the
        UI can toast the DCCNN code without an HTTP round trip.
        """
        user_id = await _user_for_sid(sid)
        if not user_id:
            await sio.emit("message:error", {"error": "Not signed in"}, room=sid)
            return
        if not isinstance(data, dict):
            await sio.emit("message:error", {"error": "Invalid message"}, room=sid)
            return
        peer_id = (data.get("peer_id") or data.get("peerId") or "").strip()
        kind = data.get("kind") or "text"
        text = data.get("text")
        payload = data.get("payload")
        try:
            from app.core.database import get_db
            from app.services import messaging_service as ms
            msg = await ms.send_message(get_db(), user_id, peer_id, kind, text, payload)
        except Exception as e:
            detail = getattr(e, "detail", None) or str(e)
            code = getattr(e, "error_code", None)
            await sio.emit("message:error", {"error": detail, "code": code}, room=sid)
            return
        await sio.emit("message:ack", msg, room=sid)
        # Deliver to every socket the receiver has open (mobile + web).
        for peer_sid, uid in list(_sid_users.items()):
            if uid == peer_id:
                await sio.emit("message:new", msg, room=peer_sid)

    @sio.event
    async def presence_list(sid):
        """A client (re)joining asks for the current presence snapshot."""
        await sio.emit("presence", {"users": presence_users()}, room=sid)

    @sio.event
    async def player_state(sid, data):
        """Relay playback state to the user's other devices (latest wins)."""
        user_id = await _user_for_sid(sid)
        if not user_id or not isinstance(data, dict):
            return
        # Guard against unbounded growth of the payload
        data = dict(data)
        data["user_id"] = user_id
        _player_state[user_id] = data
        if len(_player_state) > 500:  # never let anonymous/old entries grow forever
            _player_state.clear()
            _player_state[user_id] = data
        try:
            await sio.emit("player:state", data, skip_sid=sid)
        except Exception as e:
            log.warning("ws.player_state.emit.failed", error=str(e))
        # Presence rides the same event: a playing-state change re-broadcasts
        # the "listening to" summary to everyone connected.
        await _broadcast_presence(sio)