import structlog
from app.websocket.ws_manager import ws_manager

log = structlog.get_logger()

# NOTE: No application-level heartbeat here. Python-Socket.IO's engine.io
# layer already sends protocol-level pings and drops dead connections
# (ping_interval/ping_timeout), so a manual `server:ping` loop is redundant —
# it added a server:ping emit every 30s per client that was never answered,
# which just created noise. Dead clients are cleaned up by engine.io and the
# `disconnect` handler below.


def register_events(sio) -> None:
    """Register all Socket.IO event handlers on the sio instance."""

    @sio.event
    async def connect(sid, environ):
        log.info("ws.connect", sid=sid)

    @sio.event
    async def disconnect(sid):
        log.info("ws.disconnect", sid=sid)

    @sio.event
    async def ping(sid, data):
        await sio.emit("pong", {"sid": sid}, room=sid)
