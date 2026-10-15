"""Make the api's shared modules importable from the repo-root CLI.

The CLI lives at ``Rheoson/cli/`` and reuses the server's own services
(``app.services.download_service`` and friends) instead of re-implementing
downloads, lyrics and tagging in a second place. That reuse is what keeps a
CLI download and a server download producing the exact same file.

Two things have to happen before any ``app.*`` import:

1. ``Rheoson/api`` must be on ``sys.path`` so ``app`` resolves.
2. ``api/.env`` must be loaded into the environment, because
   ``app.core.config.Settings`` reads ``.env`` relative to the *current*
   directory and the CLI is normally run from the repo root.

No new dependency is added anywhere: the CLI runs on the api's own uv
environment (``api/.venv``), which already carries httpx, yt-dlp, ytmusicapi,
syncedlyrics and mutagen.
"""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
API_DIR = REPO_ROOT / "api"


def _load_dotenv(path: Path) -> None:
    """Load ``KEY=VALUE`` lines from ``path`` without overriding the real env.

    Deliberately a tiny parser rather than a python-dotenv dependency: the
    file is a flat ``KEY=VALUE`` list and the api already treats the real
    environment as authoritative over the file, so ``setdefault`` reproduces
    pydantic-settings' precedence exactly.
    """
    if not path.is_file():
        return
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError:
        return
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if not key:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        os.environ.setdefault(key, value)


def _quiet_structlog() -> None:
    """Keep the server's log stream off the CLI's stdout.

    Every ``app.services`` module logs through structlog. With no
    configuration structlog prints to stdout, which would interleave with the
    progress bar and the result tables. Routing events to stderr at WARNING
    keeps the terminal output clean while still surfacing real failures.
    """
    import structlog

    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.KeyValueRenderer(key_order=["event"]),
        ],
        logger_factory=structlog.PrintLoggerFactory(file=sys.stderr),
        # ERROR, not WARNING: with no socket transport running the download
        # service's progress broadcasts log a warning per tick, which would
        # otherwise spray the terminal. Failures surface through the job
        # result the CLI prints, not through this stream.
        wrapper_class=structlog.make_filtering_bound_logger(logging.ERROR),
        cache_logger_on_first_use=True,
    )


def bootstrap() -> None:
    """Idempotently prepare the interpreter for ``app.*`` imports."""
    api = str(API_DIR)
    if api not in sys.path:
        sys.path.insert(0, api)
    _load_dotenv(API_DIR / ".env")
    _quiet_structlog()
