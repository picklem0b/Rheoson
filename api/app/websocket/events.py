import structlog
from app.websocket.manager import ws_manager

log = structlog.get_logger()


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