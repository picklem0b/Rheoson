"""Smart logging: channel gating, profiles, the access gate, and reload.

The promise of the smart-logging system is a console you can read: successes
stay quiet, failures stay loud, and the configuration that decides which is
which is inspectable and hot-reloadable. These tests pin that promise — the
access gate's status behavior, profile floors, channel resolution, the
structlog-side drop processor, the reload trigger, and the duplicate-
traceback suppression window.
"""

from __future__ import annotations

import json
import logging
import time

import pytest
import structlog

from app.core import logging_config as lc


@pytest.fixture(autouse=True)
def _clean_state(monkeypatch):
    """Isolate every global this module touches, and restore after."""
    monkeypatch.delenv("RHEOSON_LOG_PROFILE", raising=False)
    monkeypatch.delenv("RHEOSON_LOG_LEVEL", raising=False)
    monkeypatch.delenv("RHEOSON_LOG_CHANNELS", raising=False)
    monkeypatch.delenv("RHEOSON_LOG_FORCE_RELOAD", raising=False)
    lc._suppress_until[0] = 0.0
    yield
    lc._suppress_until[0] = 0.0
    # Restore the default floors so other test modules are unaffected.
    with lc._lock:
        lc._state["floors"] = dict(lc._PROFILE_FLOORS["default"])


# ── Channel resolution ───────────────────────────────────────────────────


def test_channel_for_event_uses_first_segment():
    assert lc.channel_for_event("download.done") == "download"
    assert lc.channel_for_event("stream.relay.upstream_died") == "stream"
    assert lc.channel_for_event("Rheoson.api.ready") == "core"
    assert lc.channel_for_event("ws.disconnect") == "core"


def test_channel_for_logger_prefix_match():
    assert lc.channel_for_logger("uvicorn.access") == "access"
    assert lc.channel_for_logger("uvicorn.error") == "lifecycle"
    assert lc.channel_for_logger("syncedlyrics.providers.musixmatch") == "lyrics"
    assert lc.channel_for_logger("httpx") == "core"
    assert lc.channel_for_logger("something.unmapped") == "core"


def test_every_profile_covers_every_channel():
    for profile, floors in lc._PROFILE_FLOORS.items():
        assert set(floors) == set(lc.CHANNELS), profile


def test_quiet_profile_drops_info_everywhere():
    floors = lc.resolve_floors("quiet")
    assert all(floor >= logging.ERROR for ch, floor in floors.items() if ch != "lifecycle")


def test_debug_profile_is_the_firehose():
    floors = lc.resolve_floors("debug")
    assert all(floor == logging.DEBUG for floor in floors.values())


def test_resolve_floors_rejects_unknown_profile():
    with pytest.raises(ValueError):
        lc.resolve_floors("loud")


# ── Env overrides ────────────────────────────────────────────────────────


def test_env_profile_resolves(monkeypatch):
    monkeypatch.setenv("RHEOSON_LOG_PROFILE", "quiet")
    env = lc._env_overrides()
    assert env["profile"] == "quiet"


def test_env_profile_typo_fails_loudly(monkeypatch):
    monkeypatch.setenv("RHEOSON_LOG_PROFILE", "quiey")
    with pytest.raises(ValueError, match="RHEOSON_LOG_PROFILE"):
        lc._env_overrides()


def test_env_channels_parse(monkeypatch):
    monkeypatch.setenv("RHEOSON_LOG_CHANNELS", "stream=DEBUG, download=ERROR")
    env = lc._env_overrides()
    assert env["channel_floors"] == {"stream": logging.DEBUG, "download": logging.ERROR}


def test_env_channels_reject_unknown_channel(monkeypatch):
    monkeypatch.setenv("RHEOSON_LOG_CHANNELS", "streams=DEBUG")
    with pytest.raises(ValueError, match="unknown channel"):
        lc._env_overrides()


def test_env_channels_reject_bad_level(monkeypatch):
    monkeypatch.setenv("RHEOSON_LOG_CHANNELS", "stream=LOUD")
    with pytest.raises(ValueError, match="bad level|RHEOSON_LOG_CHANNELS"):
        lc._env_overrides()


# ── Config file ──────────────────────────────────────────────────────────


def test_config_file_profile_and_channels(tmp_path, monkeypatch):
    cfg = tmp_path / "rheoson.logconfig.json"
    cfg.write_text(json.dumps({"profile": "quiet", "channels": {"stream": "DEBUG"}}))
    monkeypatch.setattr(lc, "_config_file_paths", lambda: [cfg])
    resolved = lc._resolve_file_config(json.loads(cfg.read_text()))
    assert resolved["profile"] == "quiet"
    assert resolved["channel_floors"] == {"stream": logging.DEBUG}


def test_config_file_unknown_channel_rejected(tmp_path):
    cfg = tmp_path / "rheoson.logconfig.json"
    cfg.write_text(json.dumps({"channels": {"nope": "DEBUG"}}))
    with pytest.raises(ValueError, match="unknown channel"):
        lc._resolve_file_config(json.loads(cfg.read_text()))


def test_broken_config_file_never_raises(tmp_path, monkeypatch):
    cfg = tmp_path / "rheoson.logconfig.json"
    cfg.write_text("{not json")
    monkeypatch.setattr(lc, "_config_file_paths", lambda: [cfg])
    assert lc._load_config_file() is None


def test_missing_config_file_is_none():
    monkey = pytest.MonkeyPatch()
    monkey.setattr(lc, "_config_file_paths", lambda: [])
    try:
        assert lc._load_config_file() is None
        assert lc._stamp_config_file() is None
    finally:
        monkey.undo()


# ── Access gate ──────────────────────────────────────────────────────────


def _access_record(status: int, level: int = logging.INFO) -> logging.LogRecord:
    return logging.LogRecord(
        name="uvicorn.access",
        level=level,
        pathname="",
        lineno=0,
        msg='%s - "%s %s HTTP/%s" %d',
        args=("127.0.0.1:1", "GET", "/api/stream/x/audio", "1.1", status),
        exc_info=None,
    )


def test_access_gate_drops_success_default_profile():
    with lc._lock:
        lc._state["floors"] = dict(lc._PROFILE_FLOORS["default"])
    gate = lc.AccessLogGate()
    assert gate.filter(_access_record(200)) is False
    assert gate.filter(_access_record(204)) is False
    assert gate.filter(_access_record(307)) is False


def test_access_gate_keeps_failures_default_profile():
    with lc._lock:
        lc._state["floors"] = dict(lc._PROFILE_FLOORS["default"])
    gate = lc.AccessLogGate()
    assert gate.filter(_access_record(401)) is True
    assert gate.filter(_access_record(429)) is True
    assert gate.filter(_access_record(500)) is True
    assert gate.filter(_access_record(502)) is True


def test_access_gate_debug_profile_passes_everything():
    with lc._lock:
        lc._state["floors"] = dict(lc._PROFILE_FLOORS["debug"])
    gate = lc.AccessLogGate()
    assert gate.filter(_access_record(200)) is True


def test_access_gate_quiet_profile_drops_everything():
    with lc._lock:
        lc._state["floors"] = dict(lc._PROFILE_FLOORS["quiet"])
    gate = lc.AccessLogGate()
    assert gate.filter(_access_record(200)) is False
    assert gate.filter(_access_record(500)) is False


def test_access_gate_unclassifiable_record_follows_floor():
    """A record the gate cannot classify is never silently eaten."""
    with lc._lock:
        lc._state["floors"] = dict(lc._PROFILE_FLOORS["default"])
    gate = lc.AccessLogGate()
    plain = logging.LogRecord(
        name="uvicorn.access", level=logging.WARNING, pathname="", lineno=0,
        msg="odd", args=None, exc_info=None,
    )
    assert gate.filter(plain) is True  # WARNING >= access floor (WARNING)
    info = logging.LogRecord(
        name="uvicorn.access", level=logging.INFO, pathname="", lineno=0,
        msg="odd", args=None, exc_info=None,
    )
    assert gate.filter(info) is False  # INFO < access floor


# ── structlog-side channel drop ──────────────────────────────────────────


def test_channel_floor_filter_drops_below_floor():
    with lc._lock:
        lc._state["floors"] = dict(lc._PROFILE_FLOORS["default"])  # lyrics: WARNING
    with pytest.raises(structlog.DropEvent):
        lc.channel_floor_filter(None, "info", {"event": "lyrics.synced.ok"})


def test_channel_floor_filter_passes_at_and_above_floor():
    with lc._lock:
        lc._state["floors"] = dict(lc._PROFILE_FLOORS["default"])
    out = lc.channel_floor_filter(None, "warning", {"event": "lyrics.provider.failed"})
    assert out["event"] == "lyrics.provider.failed"
    out = lc.channel_floor_filter(None, "error", {"event": "download.failed"})
    assert out["event"] == "download.failed"


def test_channel_floor_filter_debug_profile_passes_debug_events():
    with lc._lock:
        lc._state["floors"] = dict(lc._PROFILE_FLOORS["debug"])
    out = lc.channel_floor_filter(None, "debug", {"event": "stream.fill.progress"})
    assert out["event"] == "stream.fill.progress"


def test_channel_floor_filter_maps_warn_and_exception():
    with lc._lock:
        lc._state["floors"] = dict(lc._PROFILE_FLOORS["quiet"])  # core: ERROR
    with pytest.raises(structlog.DropEvent):
        lc.channel_floor_filter(None, "warning", {"event": "core.something.warned"})
    out = lc.channel_floor_filter(None, "exception", {"event": "core.something.blew"})
    assert out["event"] == "core.something.blew"


# ── Duplicate-traceback suppression ──────────────────────────────────────


def test_suppression_window_blocks_uvicorn_error_records():
    dup = lc.DuplicateTracebackFilter()
    rec = logging.LogRecord(
        name="uvicorn.error", level=logging.ERROR, pathname="", lineno=0,
        msg="x", args=None, exc_info=None,
    )
    assert dup.filter(rec) is True  # window closed
    lc.arm_traceback_suppression()
    assert dup.filter(rec) is False  # inside the window
    time.sleep(0.55)
    assert dup.filter(rec) is True  # window closed again


def test_suppression_window_is_capped():
    lc.arm_traceback_suppression(60.0)
    with lc._lock:
        pass
    # The window can never exceed the module's ceiling.
    assert lc._suppress_until[0] - time.monotonic() <= lc._SUPPRESS_WINDOW_MAX + 0.01


def test_suppression_does_not_touch_non_error_levels():
    dup = lc.DuplicateTracebackFilter()
    rec = logging.LogRecord(
        name="uvicorn.error", level=logging.WARNING, pathname="", lineno=0,
        msg="x", args=None, exc_info=None,
    )
    lc.arm_traceback_suppression()
    assert dup.filter(rec) is True


# ── Snapshot & reload ────────────────────────────────────────────────────


def test_snapshot_shape():
    with lc._lock:
        lc._state["floors"] = dict(lc._PROFILE_FLOORS["default"])
    snap = lc.snapshot()
    assert snap["profile"] == "default"
    assert snap["rootLevel"] in ("INFO", "DEBUG")
    assert set(snap["channels"]) == set(lc.CHANNELS)


def test_maybe_reload_is_cheap_when_nothing_changed(monkeypatch):
    monkeypatch.setattr(lc, "_stamp_config_file", lambda: None)
    with lc._lock:
        lc._state["mtime"] = None
        lc._state["size"] = None
    assert lc.maybe_reload() is False


def test_maybe_reload_fires_when_file_appears(monkeypatch):
    calls = []
    monkeypatch.setattr(lc, "_stamp_config_file", lambda: (123.0, 42))
    monkeypatch.setattr(lc, "configure_logging", lambda: calls.append(1))
    with lc._lock:
        lc._state["mtime"] = None
        lc._state["size"] = None
    assert lc.maybe_reload() is True
    assert calls == [1]


def test_maybe_reload_fires_on_stamp_change(monkeypatch):
    calls = []
    monkeypatch.setattr(lc, "_stamp_config_file", lambda: (999.0, 42))
    monkeypatch.setattr(lc, "configure_logging", lambda: calls.append(1))
    with lc._lock:
        lc._state["mtime"] = 123.0
        lc._state["size"] = 42
    assert lc.maybe_reload() is True


# ── configure_logging smoke ──────────────────────────────────────────────


def test_configure_logging_applies_default_floors(monkeypatch):
    # Patch the file sink so the test never writes rheoson.log.
    monkeypatch.setattr(lc, "_file_handler", lambda: None)
    lc.configure_logging()
    snap = lc.snapshot()
    assert snap["profile"] == "default"
    assert snap["channels"]["access"] == "WARNING"
    assert snap["channels"]["lyrics"] == "WARNING"
    # The access gate and the dedupe filter are installed exactly once.
    assert sum(isinstance(f, lc.AccessLogGate) for f in logging.getLogger("uvicorn.access").filters) == 1
    assert sum(isinstance(f, lc.DuplicateTracebackFilter) for f in logging.getLogger("uvicorn.error").filters) == 1


def test_configure_logging_debug_profile_implies_debug_root(monkeypatch):
    monkeypatch.setattr(lc, "_file_handler", lambda: None)
    monkeypatch.setenv("RHEOSON_LOG_PROFILE", "debug")
    lc.configure_logging()
    snap = lc.snapshot()
    assert snap["profile"] == "debug"
    assert snap["rootLevel"] == "DEBUG"
    # Restore the default profile for subsequent tests.
    monkeypatch.delenv("RHEOSON_LOG_PROFILE")
    lc.configure_logging()
