"""
Re-exports the sio instance from main so other modules
can emit events without circular imports.

Usage:
    from app.websocket.manager import emit_progress
    await emit_progress(job_id, 0.45, "Song Title")
"""
from __future__ import annotations


async def emit_progress(job_id: str, progress: float, title: str = "") -> None:
    from app.main import sio
    await sio.emit("download:progress", {
        "job_id":   job_id,
        "progress": progress,
        "title":    title,
        "status":   "downloading",
    })


async def emit_complete(job_id: str, title: str, path: str) -> None:
    from app.main import sio
    await sio.emit("download:complete", {
        "job_id": job_id,
        "title":  title,
        "path":   path,
        "status": "complete",
    })


async def emit_error(job_id: str, error: str) -> None:
    from app.main import sio
    await sio.emit("download:error", {
        "job_id": job_id,
        "error":  error,
        "status": "failed",
    })