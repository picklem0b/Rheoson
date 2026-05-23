from __future__ import annotations
import structlog
from typing import Any

log = structlog.get_logger()


class ConnectionManager:
    """
    Thin wrapper around the Socket.IO server instance.
    Imported by services to emit download progress, errors, etc.
    The actual `sio` instance is injected at startup from main.py.
    """

    def __init__(self) -> None:
        self._sio: Any = None

    def init(self, sio: Any) -> None:
        self._sio = sio

    # ── Emit helpers ──────────────────────────────────────────

    async def emit(self, event: str, data: dict, room: str | None = None) -> None:
        if self._sio is None:
            log.warning("ws.emit.no_server", event=event)
            return
        try:
            await self._sio.emit(event, data, room=room)
        except Exception as e:
            log.error("ws.emit.failed", event=event, error=str(e))

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