from __future__ import annotations
import asyncio
import structlog
from typing import Any

log = structlog.get_logger()

# Events emitted before init() are buffered here (bounded) and flushed once
# the sio instance is available, so startup-time emits are never lost.
_pending_events: list[tuple[str, dict, str | None]] = []
_MAX_PENDING = 50


class ConnectionManager:
    """
    Thin wrapper around the Socket.IO server instance.
    Imported by services to emit download progress, errors, etc.
    The actual `sio` instance is injected at startup from main.py.
    """

    def __init__(self) -> None:
        self._sio: Any = None
        self._connected_since: float | None = None

    def init(self, sio: Any) -> None:
        self._sio = sio
        # Events emitted before the ASGI server handed us the sio instance
        # are queued here and flushed on init — emitting into a None sio
        # would drop them silently.
        if _pending_events:
            log.info("ws.emit.flushing_pending", count=len(_pending_events))
            for event, data, room in _pending_events:
                asyncio.get_event_loop().create_task(self.emit(event, data, room))
            _pending_events.clear()

    # ── Emit helpers ──────────────────────────────────────────

    async def emit(self, event: str, data: dict, room: str | None = None) -> None:
        # `event_name`, not `event`: structlog binds the first positional
        # argument to a reserved `event` key, so `event=event` is a duplicate
        # kwarg and raises TypeError. That TypeError escaped into the download
        # task that called this and killed the job, so the naming here is
        # load-bearing rather than cosmetic.
        try:
            if self._sio is None:
                # Buffer instead of silently dropping
                if len(_pending_events) < _MAX_PENDING:
                    _pending_events.append((event, data, room))
                    log.warning(
                        "ws.emit.queued", event_name=event, pending=len(_pending_events)
                    )
                else:
                    log.warning("ws.emit.dropped_queue_full", event_name=event)
                return
            await self._sio.emit(event, data, room=room)
        except Exception as e:  # noqa: BLE001 — emit is fire-and-forget
            # A failed broadcast must never be what fails a download. Callers
            # are background tasks with no way to handle it, so it is logged
            # and swallowed here.
            try:
                log.error("ws.emit.failed", event_name=event, error=str(e))
            except Exception:  # noqa: BLE001 — logging must not re-raise
                pass

    async def emit_download_progress(self, job_id: str, progress: float, status: str, **extra) -> None:
        await self.emit("download:progress", {
            "id":       job_id,
            "progress": progress,
            "status":   status,
            **extra,
        })

    async def emit_download_done(self, job_id: str, file_path: str, **extra) -> None:
        await self.emit("download:done", {
            "id":       job_id,
            "status":   "done",
            "progress": 100,
            "filePath": file_path,
            **extra,
        })

    async def emit_download_error(self, job_id: str, error: str) -> None:
        await self.emit("download:error", {
            "id":     job_id,
            "status": "error",
            "error":  error,
        })


# ── Singleton ─────────────────────────────────────────────────
ws_manager = ConnectionManager()