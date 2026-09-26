"""Smart logging configuration — channels, profiles, and a debug-config file.

The console is the primary sink: JSON lines in production, colored console
rendering in development, mirrored to a size-rotated ``rheoson.log`` when a
writable data directory exists. Everything else in this module exists to
keep that console *readable*:

- **Channels** group log output by subsystem (access, stream, download,
  library, lyrics, lifecycle, core). Each channel has a minimum severity so
  a chatty subsystem can be quieted without silencing the app.
- **Profiles** are named presets over those floors (``default`` / ``quiet``
  / ``debug``) so the common cases are one environment variable, not a
  config file. ``quiet`` surfaces application-breaking errors only;
  ``debug`` is the full firehose.
- **The access gate** drops uvicorn's per-request "200 OK" lines by default
  — the single biggest source of noise — while 4xx/5xx always pass.
- **Traceback suppression** removes uvicorn's duplicate copy of an
  exception the app has already logged (armed by the code that logs the
  authoritative version).

Resolution order (last wins):

1. Built-in defaults for the active profile
2. ``rheoson.logconfig.json`` (MUSIC_DIR → CWD → api/)
3. ``RHEOSON_LOG_PROFILE`` / ``RHEOSON_LOG_LEVEL`` / ``RHEOSON_LOG_CHANNELS``

The config file is watched cheaply (mtime + size): touch it and the next
``maybe_reload()`` — called by the background refresh loop in main.py —
applies the new floors without a restart. Env overrides are re-resolved on
every reload too, so flipping a variable at runtime works the same way.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any, Optional

import structlog

from app.core.config import settings

# Bounds the on-disk log footprint (two files: the active log plus one
# rotation).
_LOG_MAX_BYTES = 2 * 1024 * 1024
_LOG_BACKUP_COUNT = 1

DEBUG, INFO, WARNING, ERROR, CRITICAL = (
    logging.DEBUG,
    logging.INFO,
    logging.WARNING,
    logging.ERROR,
    logging.CRITICAL,
)

# ── Channels ─────────────────────────────────────────────────────────────
#
# A channel is a subsystem boundary. structlog event names pick their
# channel by first dot-segment ("download.done" → "download"); stdlib
# logger names (uvicorn, third-party libs) match by prefix
# ("uvicorn.access" → "access"). Floors: debug < info < warning < error.

CHANNELS: tuple[str, ...] = (
    "access",      # per-request lines (uvicorn.access)
    "stream",      # relay, cache, buffer, artwork serving
    "download",    # job lifecycle, yt-dlp progress
    "library",     # scans, index builds, metadata writes
    "lyrics",      # synced-lyrics providers (incl. the syncedlyrics lib)
    "lifecycle",   # boot, shutdown, cron, health, websocket sessions
    "core",        # auth, config, database — everything else app-side
)

_PROFILE_FLOORS: dict[str, dict[str, int]] = {
    "default": {
        "access":    WARNING,   # the "GET … 200 OK" flood lives here
        "stream":    INFO,
        "download":  INFO,
        "library":   INFO,
        "lyrics":    WARNING,   # provider chatter ("Looking for an LRC…")
        "lifecycle": INFO,
        "core":      INFO,
    },
    "quiet": {
        # Application-breaking errors and nothing else.
        "access":    CRITICAL,
        "stream":    ERROR,
        "download":  ERROR,
        "library":   ERROR,
        "lyrics":    ERROR,
        "lifecycle": WARNING,
        "core":      ERROR,
    },
    "debug": {
        # Everything, everywhere — the firehose for tracing one flow.
        **{name: DEBUG for name in CHANNELS},
    },
}

PROFILES: tuple[str, ...] = tuple(_PROFILE_FLOORS)

# stdlib logger name → channel. Prefix-matched, first hit wins. Driver
# libraries (httpx, pymongo, …) are deliberately NOT mapped to a channel:
# they log an INFO event per connection/request, and their established
# behavior in this app is "capped at WARNING, always" — they live in the
# always-capped list in configure_logging instead.
_LOGGER_CHANNELS: tuple[tuple[str, str], ...] = (
    ("uvicorn.access", "access"),
    ("uvicorn.error", "lifecycle"),
    ("uvicorn", "lifecycle"),
    ("syncedlyrics", "lyrics"),
)

_LEVEL_NAMES: dict[str, int] = {
    "DEBUG": DEBUG,
    "INFO": INFO,
    "WARNING": WARNING,
    "ERROR": ERROR,
    "CRITICAL": CRITICAL,
}

# ── Runtime state ────────────────────────────────────────────────────────

_lock = threading.Lock()
_state: dict[str, Any] = {
    "profile": "default",
    "floors": dict(_PROFILE_FLOORS["default"]),
    "root_level": INFO,
    "source": "builtin",
    "mtime": None,
    "size": None,
}


def resolve_floors(profile: str, channel_floors: dict[str, int] | None = None) -> dict[str, int]:
    """Material channel floors for a profile, with explicit overrides applied."""
    if profile not in _PROFILE_FLOORS:
        raise ValueError(f"profile {profile!r} is not one of {', '.join(PROFILES)}")
    floors = dict(_PROFILE_FLOORS[profile])
    if channel_floors:
        floors.update(channel_floors)
    return floors


def channel_for_event(event: str) -> str:
    """Channel for a structlog event name: first dot-segment, else core."""
    first = event.split(".", 1)[0]
    return first if first in CHANNELS else "core"


def channel_for_logger(logger_name: str) -> str:
    """Channel for a stdlib logger name (prefix match, first hit wins)."""
    for prefix, channel in _LOGGER_CHANNELS:
        if logger_name == prefix or logger_name.startswith(prefix + "."):
            return channel
    return "core"


def _channel_logger_names(channel: str) -> tuple[str, ...]:
    """stdlib logger names that belong to a channel."""
    return tuple(name for name, ch in _LOGGER_CHANNELS if ch == channel)


def channel_floor(channel: str) -> int:
    """The live floor for a channel (filters consult this, so reloads apply)."""
    with _lock:
        return _state["floors"].get(channel, INFO)


# ── Configuration sources ────────────────────────────────────────────────

def _parse_level(value: str, *, what: str) -> int:
    key = value.strip().upper()
    if key not in _LEVEL_NAMES:
        raise ValueError(f"{what}: {value!r} is not one of {', '.join(_LEVEL_NAMES)}")
    return _LEVEL_NAMES[key]


def _env_overrides() -> dict[str, Any]:
    """Environment variables win over the config file, which wins over defaults."""
    out: dict[str, Any] = {}

    profile = os.environ.get("RHEOSON_LOG_PROFILE", "").strip().lower()
    if profile:
        if profile not in _PROFILE_FLOORS:
            # A typo must fail loudly, not silently pick "default" — the
            # same fail-closed posture as ENV itself.
            raise ValueError(
                f"RHEOSON_LOG_PROFILE={profile!r} is not one of {', '.join(PROFILES)}"
            )
        out["profile"] = profile

    level = os.environ.get("RHEOSON_LOG_LEVEL", "")
    if level.strip():
        out["root_level"] = _parse_level(level, what="RHEOSON_LOG_LEVEL")

    raw = os.environ.get("RHEOSON_LOG_CHANNELS", "").strip()
    if raw:
        floors: dict[str, int] = {}
        for part in raw.split(","):
            part = part.strip()
            if not part:
                continue
            channel, _, lvl = part.partition("=")
            channel = channel.strip().lower()
            if channel not in CHANNELS:
                raise ValueError(
                    f"RHEOSON_LOG_CHANNELS: unknown channel {channel!r} "
                    f"(known: {', '.join(CHANNELS)})"
                )
            floors[channel] = _parse_level(lvl or "DEBUG", what=f"RHEOSON_LOG_CHANNELS[{channel}]")
        if floors:
            out["channel_floors"] = floors

    return out


def _config_file_paths() -> list[Path]:
    """Where rheoson.logconfig.json may live, in priority order."""
    api_root = Path(__file__).resolve().parent.parent.parent  # api/
    return [
        Path(settings.MUSIC_DIR) / "rheoson.logconfig.json",
        Path.cwd() / "rheoson.logconfig.json",
        api_root / "rheoson.logconfig.json",
    ]


def _stamp_config_file() -> Optional[tuple[float, int]]:
    for path in _config_file_paths():
        try:
            st = path.stat()
            return (st.st_mtime, st.st_size)
        except OSError:
            continue
    return None


def _load_config_file() -> Optional[dict[str, Any]]:
    """Read the first rheoson.logconfig.json that exists (best effort)."""
    for path in _config_file_paths():
        try:
            if not path.is_file():
                continue
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            if not isinstance(data, dict):
                raise ValueError("top level must be a JSON object")
            return data
        except (OSError, ValueError) as e:
            # A broken config must be visible but must never stop the app.
            logging.getLogger(__name__).warning(
                "logging.config_file.invalid", extra={"path": str(path), "error": str(e)}
            )
            continue
    return None


def _resolve_file_config(data: dict[str, Any]) -> dict[str, Any]:
    """Validate a parsed config file into the same shape as _env_overrides."""
    out: dict[str, Any] = {}

    profile = str(data.get("profile", "")).strip().lower()
    if profile:
        if profile not in _PROFILE_FLOORS:
            raise ValueError(
                f"logconfig: profile {profile!r} is not one of {', '.join(PROFILES)}"
            )
        out["profile"] = profile

    level = str(data.get("level", ""))
    if level.strip():
        out["root_level"] = _parse_level(level, what="logconfig level")

    channels = data.get("channels")
    if channels is not None:
        if not isinstance(channels, dict):
            raise ValueError("logconfig: 'channels' must be an object")
        floors: dict[str, int] = {}
        for channel, lvl in channels.items():
            if channel not in CHANNELS:
                raise ValueError(f"logconfig: unknown channel {channel!r}")
            floors[channel] = _parse_level(str(lvl), what=f"logconfig channels[{channel}]")
        if floors:
            out["channel_floors"] = floors

    return out


# ── Access gate ──────────────────────────────────────────────────────────
#
# uvicorn's access logger emits one INFO line per request. That is the
# flood ("200, 200, 200…"). The gate drops *successful* request lines
# entirely and keeps 4xx/5xx so broken clients and failing routes stay
# visible. It is installed on the uvicorn.access logger itself — uvicorn
# configures that logger with propagate=False, so the logger's own filter
# is the single choke point; putting the gate on root handlers instead
# could eat unrelated app events that happen to carry a `status` field.


class AccessLogGate(logging.Filter):
    """Drop successful request logs; keep failures.

    uvicorn logs every access line at INFO — including the 5xx ones — so the
    decision is made by status, not record level:

    - ``debug`` profile (floor ≤ DEBUG): everything passes (firehose).
    - ``quiet`` profile (floor = CRITICAL): everything drops.
    - otherwise: 4xx/5xx pass, 2xx/3xx drop, and any non-access record
      (no recognizable status) falls back to the channel floor so an
      unclassifiable line is never silently eaten.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        floor = channel_floor("access")
        status = self.status_of(record)
        if floor <= DEBUG:
            return True
        if floor >= CRITICAL:
            return False
        if status is None:
            return record.levelno >= floor
        return status >= 400

    @staticmethod
    def status_of(record: logging.LogRecord) -> Optional[int]:
        # uvicorn.access: args == (addr, method, full_path, http_version, status)
        args = record.args
        if isinstance(args, tuple) and len(args) >= 5:
            try:
                return int(args[4])
            except (TypeError, ValueError):
                return None
        return None


# ── Duplicate-traceback suppression ──────────────────────────────────────
#
# When an exception escapes a streaming response, the app logs the
# authoritative structured record (with a request id) and then the ASGI
# layer prints the same exception again as a raw traceback. The arming site
# (stream_router's relay guard) opens a short window right before the
# exception propagates; within that window uvicorn.error ERROR records are
# dropped. A one-second ceiling bounds the cost of a crash between arm and
# trigger: nothing is ever suppressed for long.

_SUPPRESS_WINDOW_MAX = 1.0
_suppress_until: list[float] = [0.0]


def arm_traceback_suppression(window: float = 0.5) -> None:
    """Suppress uvicorn.error ERROR records for the next ``window`` seconds.

    Called immediately before an exception is allowed to propagate after the
    app has already logged it, so the framework's duplicate traceback
    disappears without touching genuinely new framework errors.
    """
    _suppress_until[0] = time.monotonic() + min(window, _SUPPRESS_WINDOW_MAX)


class DuplicateTracebackFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if record.levelno < ERROR:
            return True
        return time.monotonic() >= _suppress_until[0]


# ── Channel filter (structlog side) ─────────────────────────────────────
#
# App events all route through the stdlib *root* logger (structlog's stdlib
# factory), so per-channel floors cannot ride on logger names. Instead a
# processor sits at the head of the structlog chain and drops events whose
# channel's floor is above their severity — before rendering, before the
# sinks. `raise DropEvent` is structlog's documented drop signal.


def channel_floor_filter(logger, method_name: str, event_dict: dict):
    """structlog processor: enforce the channel floor for app events."""
    method = method_name.lower()
    level = {
        "debug": DEBUG,
        "info": INFO,
        "warning": WARNING,
        "warn": WARNING,
        "error": ERROR,
        "exception": ERROR,
        "critical": CRITICAL,
        "fatal": CRITICAL,
        "log": DEBUG,
    }.get(method, INFO)
    event = str(event_dict.get("event", ""))
    if level < channel_floor(channel_for_event(event)):
        raise structlog.DropEvent
    return event_dict


# ── Channel gate (live floors for third-party loggers) ───────────────────

class ChannelGate(logging.Filter):
    """Enforce a channel's floor from live state, so a reload applies at once.

    Complements the pinned logger level (set at configure time): the pinned
    level is the cheap gate, this filter keeps a reloaded floor honest even
    if a library re-raises its own logger level behind our back.
    """

    def __init__(self, channel: str) -> None:
        super().__init__()
        self.channel = channel

    def filter(self, record: logging.LogRecord) -> bool:
        return record.levelno >= channel_floor(self.channel)


# ── File sink ────────────────────────────────────────────────────────────

def _file_handler() -> Optional[RotatingFileHandler]:
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


# ── Configuration entry points ───────────────────────────────────────────

def _resolve_configuration() -> dict[str, Any]:
    """builtin → file → env, validating and reporting the winning source."""
    profile = "default"
    channel_floors: dict[str, int] = {}
    root_level = DEBUG if settings.is_dev else INFO
    source = "builtin"
    level_explicit = False

    data = _load_config_file()
    if data:
        try:
            resolved = _resolve_file_config(data)
            profile = resolved.get("profile", profile)
            channel_floors = resolved.get("channel_floors", {})
            if "root_level" in resolved:
                root_level = resolved["root_level"]
                level_explicit = True
            source = "file"
        except ValueError as e:
            logging.getLogger(__name__).warning(
                "logging.config_file.invalid", extra={"error": str(e)}
            )

    try:
        env = _env_overrides()
    except ValueError:
        # Env is the most explicit input: a typo there is a boot-stopping
        # misconfiguration, not something to paper over.
        raise
    if env:
        profile = env.get("profile", profile)
        channel_floors = {**channel_floors, **env.get("channel_floors", {})}
        if "root_level" in env:
            root_level = env["root_level"]
            level_explicit = True
        source = "env"

    return {
        "profile": profile,
        "channel_floors": channel_floors,
        "root_level": root_level,
        "level_explicit": level_explicit,
        "source": source,
        "stamp": _stamp_config_file(),
    }


def _apply_floors(floors: dict[str, int]) -> None:
    """Pin channel floors onto the mapped stdlib loggers.

    The access channel is the exception: uvicorn logs every access line at
    INFO (even 5xx), so its logger stays pinned at DEBUG and the
    AccessLogGate makes the keep/drop call by status. Pinning it at the
    floor here would hide the very failures the gate must show.
    """
    for channel, floor in floors.items():
        for name in _channel_logger_names(channel):
            lg = logging.getLogger(name)
            if channel == "access":
                lg.setLevel(DEBUG)
                continue
            lg.setLevel(floor)
            if not any(isinstance(f, ChannelGate) and f.channel == channel for f in lg.filters):
                lg.addFilter(ChannelGate(channel))


def configure_logging() -> None:
    """Apply the resolved channels, gates, and structlog processors.

    Runs at import time of app.main — i.e. AFTER uvicorn applied its own
    log config (uvicorn.Config.__init__ precedes the app import), so the
    gates and floors set here win.
    """
    cfg = _resolve_configuration()
    floors = resolve_floors(cfg["profile"], cfg["channel_floors"])
    root_level = cfg["root_level"]
    # Any channel that asks for DEBUG visibility implies a DEBUG root, unless
    # the level was set explicitly (file/env). Without this, a per-channel
    # DEBUG floor could never fire: the filtering bound logger drops events
    # below the root before processors run. Mapped third-party loggers stay
    # floored by their own channels, so the firehose reaches app events and
    # the libraries you opened up — not everything on the machine.
    if DEBUG in floors.values() and not cfg["level_explicit"]:
        root_level = DEBUG

    handlers: list[logging.Handler] = [logging.StreamHandler()]
    file_handler = _file_handler()
    if file_handler is not None:
        handlers.append(file_handler)
    logging.basicConfig(format="%(message)s", level=root_level, handlers=handlers)

    # Access gate directly on the access logger: uvicorn's default config
    # sets propagate=False on uvicorn.access, so the logger-level filter is
    # the single choke point every access line passes through exactly once.
    access_logger = logging.getLogger("uvicorn.access")
    if not any(isinstance(f, AccessLogGate) for f in access_logger.filters):
        access_logger.addFilter(AccessLogGate())

    # Dedupe the ASGI layer's copy of already-logged tracebacks.
    uvicorn_error = logging.getLogger("uvicorn.error")
    if not any(isinstance(f, DuplicateTracebackFilter) for f in uvicorn_error.filters):
        uvicorn_error.addFilter(DuplicateTracebackFilter())

    _apply_floors(floors)

    # The noisy driver loggers stay capped at WARNING regardless of channel
    # config — they emit an event per connection-pool change or HTTP request,
    # pure noise for a single-user app.
    for name in (
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
        logging.getLogger(name).setLevel(WARNING)

    shared_processors: list = [
        structlog.contextvars.merge_contextvars,
        # Per-channel floors for app events — before any rendering, so a
        # dropped event costs nothing.
        channel_floor_filter,
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
        wrapper_class=structlog.make_filtering_bound_logger(root_level),
        context_class=dict,
        # Route through stdlib so every sink — console and the rotating
        # file — receives the same rendered event.
        logger_factory=structlog.stdlib.LoggerFactory(),
        # Not cached: a reloaded root level must reach the filtering
        # wrappers immediately. The lazy-proxy resolution cost is the price
        # of a log config that actually applies without a restart.
        cache_logger_on_first_use=False,
    )

    with _lock:
        _state["profile"] = cfg["profile"]
        _state["floors"] = dict(floors)
        _state["root_level"] = root_level
        _state["source"] = cfg["source"]
        stamp = cfg["stamp"]
        _state["mtime"] = stamp[0] if stamp else None
        _state["size"] = stamp[1] if stamp else None


def maybe_reload() -> bool:
    """Re-resolve configuration when the config file changed on disk.

    Cheap (stat, plus a JSON read only when the file changed); called from
    the background refresh loop. Returns True when configuration was
    re-applied. Env overrides are re-resolved too, so flipping a variable
    inside the process works the same as touching the file.
    """
    stamp = _stamp_config_file()
    with _lock:
        # Normalize: a missing file is (None, None), so a fresh stamp tuple
        # always differs — but "still missing" must compare equal, or every
        # tick would reconfigure for no reason.
        current = (stamp[0], stamp[1]) if stamp else (None, None)
        changed = (
            current != (_state["mtime"], _state["size"])
            or os.environ.get("RHEOSON_LOG_FORCE_RELOAD") == "1"
        )
    if not changed:
        return False
    configure_logging()
    return True


def snapshot() -> dict[str, Any]:
    """Current logging state — surfaced by /api/health/diag."""
    with _lock:
        return {
            "profile": _state["profile"],
            "source": _state["source"],
            "rootLevel": logging.getLevelName(_state["root_level"]),
            "channels": {
                channel: logging.getLevelName(floor)
                for channel, floor in _state["floors"].items()
            },
        }
