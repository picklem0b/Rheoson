"""Structured logging configuration.

Console output is the primary sink: JSON lines in production, colored
console rendering in development. When a writable data directory is
available a size-rotated file sink mirrors the console stream, so
self-hosted instances (Termux, VPS, Docker) keep diagnosable history
without depending on an external log collector.
"""

import logging
import os
from logging.handlers import RotatingFileHandler
from pathlib import Path

import structlog

from app.core.config import settings

# Bounds the on-disk log footprint (two files: the active log plus one
# rotation).
_LOG_MAX_BYTES = 2 * 1024 * 1024
_LOG_BACKUP_COUNT = 1


def _file_handler() -> RotatingFileHandler | None:
    """Best-effort rotating file sink; None when no writable location exists.

    Prefers MUSIC_DIR so the log lands next to the other instance state
    (sidecars, caches, the download job store), falling back to the
    process working directory, and finally giving up silently — a log
    file must never prevent startup.
    """
    candidates = [settings.MUSIC_DIR, os.getcwd()]
    for directory in candidates:
        try:
            path = Path(directory) / "rheoson.log"
            path.parent.mkdir(parents=True, exist_ok=True)
            handler = RotatingFileHandler(
                path,
                maxBytes=_LOG_MAX_BYTES,
                backupCount=_LOG_BACKUP_COUNT,
                encoding="utf-8",
            )
            handler.setFormatter(logging.Formatter("%(message)s"))
            return handler
        except OSError:
            continue
    return None


def configure_logging() -> None:
    level = logging.DEBUG if settings.is_dev else logging.INFO

    handlers: list[logging.Handler] = [logging.StreamHandler()]
    file_handler = _file_handler()
    if file_handler is not None:
        handlers.append(file_handler)
    logging.basicConfig(format="%(message)s", level=level, handlers=handlers)

    # Only useful logs: the Mongo driver emits a JSON event per connection
    # pool change and heartbeat — pure noise for a single-user app.
    for noisy in (
        "httpx",
        "httpcore",
        "urllib3",
        "asyncio",
        "pymongo",
        "pymongo.connection",
        "pymongo.topology",
        "pymongo.pool",
        "motor",
        "motor.core",
    ):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    shared_processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
    ]

    if settings.is_dev:
        processors = shared_processors + [
            structlog.dev.ConsoleRenderer(colors=True),
        ]
    else:
        processors = shared_processors + [
            structlog.processors.dict_tracebacks,
            structlog.processors.JSONRenderer(),
        ]

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(level),
        context_class=dict,
        # Route through stdlib so every sink — console and the rotating
        # file — receives the same rendered event.
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
