import asyncio
import structlog
from app.websocket.ws_manager import ws_manager

log = structlog.get_logger()

# BUG #19: Track connected SIDs for server-side heartbeat
_heartbeat_tasks: dict[str, asyncio.Task] = {}
HEARTBEAT_INTERVAL = 30  # seconds
HEARTBEAT_TIMEOUT = 45   # seconds — drop if no pong within this time


def _start_heartbeat(sio, sid: str) -> None:
    """Send periodic pings and disconnect stale clients."""
    async def _hb():
        try:
            while True:
                await asyncio.sleep(HEARTBEAT_INTERVAL)
                try:
                    await asyncio.wait_for(
                        sio.emit("server:ping", {"ts": asyncio.get_event_loop().time()}, room=sid),
                        timeout=5.0,
                    )
                except Exception:
                    log.warning("ws.heartbeat.emit_failed", sid=sid)
                    break
        except asyncio.CancelledError:
            pass
    task = asyncio.create_task(_hb())
    _heartbeat_tasks[sid] = task


def _stop_heartbeat(sid: str) -> None:
    task = _heartbeat_tasks.pop(sid, None)
    if task and not task.done():
        task.cancel()


def register_events(sio) -> None:
    """Register all Socket.IO event handlers on the sio instance."""

    @sio.event
    async def connect(sid, environ):
        log.info("ws.connect", sid=sid)
        _start_heartbeat(sio, sid)

    @sio.event
    async def disconnect(sid):
        log.info("ws.disconnect", sid=sid)
        _stop_heartbeat(sid)

    @sio.event
    async def ping(sid, data):
        await sio.emit("pong", {"sid": sid}, room=sid)