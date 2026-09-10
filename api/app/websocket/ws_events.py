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

from app.websocket.ws_manager import ws_manager

log = structlog.get_logger()

# sid → user_id for authenticated sockets
_sid_users: dict[str, str] = {}
# user_id → latest player state (single-source snapshot per account)
_player_state: dict[str, dict] = {}


async def _user_for_sid(sid: str) -> str | None:
    return _sid_users.get(sid)


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
        else:
            log.info("ws.connect.anon", sid=sid)

    @sio.event
    async def disconnect(sid):
        user_id = _sid_users.pop(sid, None)
        log.info("ws.disconnect", sid=sid, user_id=user_id)

    @sio.event
    async def ping(sid, data):
        await sio.emit("pong", {"sid": sid}, room=sid)

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