"""The Socket.IO broadcast helper must never be the reason a job fails.

The regression: ``emit`` logged ``log.warning("ws.emit.queued", event=event)``.
structlog binds the first positional argument to a reserved ``event`` key, so
the keyword collided with it and raised ``TypeError``. Because ``emit`` is
called from inside ``_download_task`` at the very start of a job, that
``TypeError`` propagated out of the emit call and killed the download — a job
started while no client was connected failed before it fetched a byte.

Two things are pinned here: the helper is total (no input or transport failure
can make it raise), and no module reintroduces the reserved-keyword pattern.
"""

from __future__ import annotations

import asyncio
import re
from pathlib import Path

import pytest

from app.websocket import ws_manager as ws_module
from app.websocket.ws_manager import ConnectionManager


@pytest.fixture(autouse=True)
def _clean_buffers():
    """The pending buffer is module-global; do not let tests leak into it."""
    ws_module._pending_events.clear()
    yield
    ws_module._pending_events.clear()


def test_emit_buffers_without_raising_before_init():
    """Emits in the pre-init window queue instead of exploding."""
    manager = ConnectionManager()

    asyncio.run(manager.emit("download:progress", {"id": "job-1", "progress": 0.0}))

    assert ws_module._pending_events == [
        ("download:progress", {"id": "job-1", "progress": 0.0}, None)
    ]


def test_emit_is_total_when_the_transport_raises():
    """A transport failure is logged and swallowed, never re-raised."""

    class BrokenTransport:
        async def emit(self, *args, **kwargs):
            raise RuntimeError("socket gone")

    manager = ConnectionManager()
    manager.init(BrokenTransport())

    # Must not raise — this is what ran inside the download task.
    asyncio.run(manager.emit("download:done", {"id": "job-1"}))


def test_download_helpers_never_raise_without_a_transport():
    manager = ConnectionManager()

    async def run():
        await manager.emit_download_progress("job-1", 0.0, "downloading")
        await manager.emit_download_done("job-1", "/tmp/x.mp3")
        await manager.emit_download_error("job-1", "boom")

    asyncio.run(run())

    assert len(ws_module._pending_events) == 3


def test_buffer_is_bounded():
    """The pre-init buffer drops rather than growing without limit."""
    manager = ConnectionManager()

    async def run():
        for i in range(ws_module._MAX_PENDING + 5):
            await manager.emit("download:progress", {"id": str(i)})

    asyncio.run(run())

    assert len(ws_module._pending_events) == ws_module._MAX_PENDING


def test_no_structlog_call_passes_a_reserved_event_keyword():
    """structlog reserves `event`; passing it as a keyword raises TypeError.

    This class of bug is invisible until the log line actually runs, which for
    a warning path may be a long time. Scanning the source is the cheapest way
    to keep it out.
    """
    app_dir = Path(__file__).resolve().parent.parent / "app"
    reserved = re.compile(r"\blog\.(debug|info|warning|error|critical|exception)\([^)]*\bevent\s*=")

    offenders: list[str] = []
    for path in app_dir.rglob("*.py"):
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if reserved.search(line):
                offenders.append(f"{path.relative_to(app_dir)}:{lineno}")

    assert offenders == [], (
        "log calls must not use the reserved structlog `event` keyword; "
        f"use `event_name`. Offenders: {offenders}"
    )
