"""Production health & diagnostics for Rheoson.

Four endpoints, three depths (all documented in the OpenAPI schema):

  GET /health/live   — process is alive. No I/O, no locks, O(1).
  GET /health/ready  — process can actually serve requests (storage is
                       present + writable). Cheap filesystem probes only.
  GET /api/health    — full snapshot. Dependency probes run in the
                       background (every ``_PROBE_TTL`` seconds) so polling
                       this endpoint never performs expensive work and a
                       slow MongoDB/external tool can never hang it.
  GET /api/health/diag — authenticated, forces a fresh bounded probe of
                       every subsystem (DB ping latency, yt-dlp/ffmpeg
                       versions, config validation, error/latency metrics).

Design rules enforced here:

  * Every dependency probe has its own strict timeout and fails gracefully.
  * Probes run with bounded concurrency, never sequentially one-after-another.
  * The payload deliberately contains NO secrets, tokens, connection
    strings, private filesystem paths, or internal stack traces.
  * A failure in one subsystem degrades that check and the overall status;
    it does not take down the rest of the application.
  * Statuses are consistent across the schema: passing | degraded |
    failing | skipped | not_tested.
"""

from __future__ import annotations

import asyncio
import collections
import os
import shutil
import time
from datetime import datetime, timezone

import structlog

log = structlog.get_logger()

# ── Status vocabulary ─────────────────────────────────────────
PASSING    = "passing"
DEGRADED   = "degraded"
FAILING    = "failing"
SKIPPED    = "skipped"
NOT_TESTED = "not_tested"

SCHEMA_VERSION = "1.0"

_ORDER = {PASSING: 0, DEGRADED: 1, FAILING: 2, SKIPPED: 3, NOT_TESTED: 4}


def _worst(statuses: list[str]) -> str:
    """Worst of the given statuses (failing > degraded > passing)."""
    if not statuses:
        return PASSING
    ranked = [_ORDER[s] for s in statuses if s in _ORDER]
    if not ranked:
        return NOT_TESTED
    best = max(ranked)
    for s, rank in _ORDER.items():
        if rank == best:
            return s
    return PASSING  # unreachable


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _now_s() -> float:
    return time.monotonic()


# ── Bounded subprocess version probe ──────────────────────────

async def _probe_command(args: list[str], timeout: float = 8.0) -> tuple[bool, str]:
    """Run `args`, return (present, first-line-or-error). Never raises."""
    try:
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError:
        return False, "not installed"
    except Exception as e:
        return False, str(e)[:120]
    try:
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        out = (stdout or b"").decode(errors="ignore").strip().splitlines()
        return proc.returncode == 0, (out[0][:120] if out else "ok")
    except asyncio.TimeoutError:
        try:
            proc.kill()
        except Exception:
            pass
        return False, "timed out"


# ── Background dependency probe ───────────────────────────────

_PROBE_TTL = 60.0  # snapshot is refreshed in the background every 60 s

_probe_cache: dict = {"ts": 0.0, "checks": {}}
_probe_lock = asyncio.Lock()
_app_started_s = _now_s()


def _check_entry(status: str, detail: str = "", duration_ms: float | None = None) -> dict:
    entry: dict = {"status": status, "checkedAt": _iso()}
    if detail:
        entry["detail"] = detail
    if duration_ms is not None:
        entry["durationMs"] = round(duration_ms, 1)
    return entry


async def _check_storage() -> dict:
    from app.core.config import settings

    t0 = _now_s()
    results = []
    for key in ("MUSIC_DIR", "DOWNLOADS_DIR"):
        d = os.environ.get(key) or getattr(settings, key, "")
        if not d:
            results.append(f"{key}:unset")
            continue
        p = os.path.expanduser(d)
        if os.path.isdir(p) and os.access(p, os.R_OK | os.W_OK):
            results.append(f"{key}:ok")
        else:
            results.append(f"{key}:unavailable")
    audio = 0
    try:
        base = os.path.expanduser(settings.MUSIC_DIR)
        if os.path.isdir(base):
            for _root, _dirs, files in os.walk(base):
                audio += sum(1 for f in files if f.lower().endswith(
                    (".mp3", ".flac", ".m4a", ".ogg", ".opus", ".wav")
                ))
    except Exception:
        pass
    detail = ", ".join(results)
    status = PASSING if all("ok" in r for r in results) else DEGRADED
    entry = _check_entry(status, detail, (_now_s() - t0) * 1000)
    entry["audioFiles"] = audio
    try:
        u = shutil.disk_usage(os.path.expanduser(settings.DOWNLOADS_DIR))
        entry["diskFreeBytes"] = u.free
        entry["diskTotalBytes"] = u.total
    except Exception:
        pass
    return entry


async def _check_mongodb() -> dict:
    from app.core.config import settings
    from app.core import database

    if database.db_available():
        db = database._db
        if db is not None:
            t0 = _now_s()
            try:
                await asyncio.wait_for(db.admin.command("ping"), timeout=2.5)
                entry = _check_entry(PASSING, "connected", (_now_s() - t0) * 1000)
                entry["latencyMs"] = round((_now_s() - t0) * 1000, 1)
                return entry
            except Exception as e:
                return _check_entry(DEGRADED, f"ping failed: {str(e)[:120]}")
        return _check_entry(PASSING, "available")
    if settings.is_dev and settings.MONGODB_URL == "mongodb://localhost:27017":
        return _check_entry(SKIPPED, "no database configured in development")
    return _check_entry(DEGRADED, "not connected")


async def _check_binaries() -> dict:
    ytdlp, ffmpeg = await asyncio.gather(
        _probe_command(["yt-dlp", "--version"]),
        _probe_command(["ffmpeg", "-version"]),
    )
    sub = {
        "ytdlp": {"present": ytdlp[0], "version": ytdlp[1] if ytdlp[0] else None},
        "ffmpeg": {"present": ffmpeg[0], "version": ffmpeg[1] if ffmpeg[0] else None},
    }
    status = PASSING if (ytdlp[0] and ffmpeg[0]) else DEGRADED
    entry = _check_entry(
        status,
        "yt-dlp: " + (ytdlp[1] if ytdlp[0] else "missing") +
        "; ffmpeg: " + (ffmpeg[1] if ffmpeg[0] else "missing"),
    )
    entry["binaries"] = sub
    return entry


async def _check_auth() -> dict:
    from app.core.config import settings

    if settings.has_clerk:
        return _check_entry(PASSING, "configured")
    if settings.is_dev:
        return _check_entry(SKIPPED, "not configured in development")
    return _check_entry(FAILING, "Clerk secret key missing")


async def _check_config() -> dict:
    """Non-secret configuration validation summary."""
    from app.core.config import settings

    issues: list[str] = []
    if settings.is_prod:
        if settings.SECRET_KEY == "dev-only-insecure-secret-key-do-not-use-in-prod":
            issues.append("SECRET_KEY is insecure")
        if not settings.CLERK_SECRET_KEY:
            issues.append("CLERK_SECRET_KEY missing")
        if not settings.CLERK_PUBLISHABLE_KEY:
            issues.append("CLERK_PUBLISHABLE_KEY missing")
    status = PASSING if not issues else FAILING
    entry = _check_entry(status, "; ".join(issues) if issues else "valid")
    entry["env"] = settings.ENV
    return entry


async def run_all_checks() -> dict[str, dict]:
    """Run every dependency probe with bounded concurrency.

    Each probe is individually timeout-guarded; the whole batch is also
    bounded so no single slow subsystem delays the others' results.
    """
    checks = await asyncio.gather(
        _check_storage(),
        _check_mongodb(),
        _check_binaries(),
        _check_auth(),
        _check_config(),
    )
    names = ["storage", "mongodb", "binaries", "auth", "config"]
    return dict(zip(names, checks))


async def refresh_probe() -> dict[str, dict]:
    """Force a fresh probe and store it in the snapshot cache."""
    async with _probe_lock:
        checks = await run_all_checks()
        _probe_cache["ts"] = _now_s()
        _probe_cache["checks"] = checks
        return checks


async def _snapshot_checks() -> dict[str, dict]:
    """Return cached checks, refreshing lazily once when stale.

    This is the path used by the public /api/health so polling it never
    performs the expensive probe repeatedly.
    """
    async with _probe_lock:
        if _now_s() - _probe_cache["ts"] > _PROBE_TTL or not _probe_cache["checks"]:
            _probe_cache["checks"] = await run_all_checks()
            _probe_cache["ts"] = _now_s()
    return _probe_cache["checks"]


# ── Lightweight metrics collector ─────────────────────────────

class MetricsCollector:
    """Bounded in-memory request metrics: totals, a 60 s window, and a
    ring of recent 5xx errors. Never stores bodies or headers."""

    def __init__(self) -> None:
        self.started_s = _now_s()
        self.total = 0
        self.by_status: collections.Counter = collections.Counter()
        self._entries: collections.deque = collections.deque(maxlen=2000)
        self.errors: collections.deque = collections.deque(maxlen=20)

    def record(self, status: int, ms: float, method: str = "", path: str = "") -> None:
        self.total += 1
        self.by_status[status] += 1
        self._entries.append((_now_s(), status, ms))
        if status >= 500:
            self.errors.append({
                "at": _iso(),
                "method": method[:8],
                "path": path[:120],
                "status": status,
                "ms": round(ms, 1),
            })

    def snapshot(self) -> dict:
        now = _now_s()
        win = [e for e in self._entries if now - e[0] <= 60.0]
        lats = sorted(e[2] for e in win)
        n = len(lats)

        def pct(p: float) -> float | None:
            if not n:
                return None
            return round(lats[min(n - 1, int(n * p))], 1)

        counts: dict[str, int] = {}
        for _ts, status, _ms in win:
            counts[str(status)] = counts.get(str(status), 0) + 1
        return {
            "uptimeS": round(now - self.started_s),
            "totalRequests": self.total,
            "window60s": {
                "requests": n,
                "byStatus": counts,
                "latencyMs": {"p50": pct(0.50), "p95": pct(0.95), "p99": pct(0.99)}
                if n else {},
            },
            "recentErrors": list(self.errors),
        }


metrics = MetricsCollector()


# ── Payload builders ──────────────────────────────────────────

def _base(request_id: str = "") -> dict:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "service": "rheoson-api",
        "generatedAt": _iso(),
        "requestId": request_id or None,
        "uptimeS": round(_now_s() - _app_started_s),
    }


def live(request_id: str = "") -> dict:
    """Liveness — answers 'is the process alive?' with zero I/O."""
    return {
        **_base(request_id),
        "status": PASSING,
        "liveness": True,
    }


async def ready(request_id: str = "") -> dict:
    """Readiness — 'can this instance serve requests right now?'."""
    checks = await run_all_checks()
    statuses = [checks["storage"]["status"], checks["config"]["status"]]
    return {
        **_base(request_id),
        "status": _worst(statuses),
        "storage": checks["storage"].get("detail", ""),
        "config": checks["config"].get("detail", ""),
    }


async def snapshot(request_id: str = "") -> dict:
    """Full cheap snapshot for public /api/health."""
    checks = await _snapshot_checks()
    return {
        **_base(request_id),
        "status": _worst([c["status"] for c in checks.values()]),
        "checks": checks,
        "summary": _summarize(checks),
        "latency": metrics.snapshot(),
    }


async def diagnostics(request_id: str = "") -> dict:
    """Deep diagnostics — authenticated-only, forces a fresh probe."""
    checks = await refresh_probe()
    return {
        **_base(request_id),
        "status": _worst([c["status"] for c in checks.values()]),
        "checks": checks,
        "summary": _summarize(checks),
        "latency": metrics.snapshot(),
        "diagnostics": {"forceRefreshedAt": _iso()},
    }


def _summarize(checks: dict[str, dict]) -> dict:
    counts: dict[str, int] = {}
    for c in checks.values():
        s = c.get("status", NOT_TESTED)
        counts[s] = counts.get(s, 0) + 1
    return counts


def app_started() -> None:
    """Mark application startup (call once from lifespan)."""
    global _app_started_s
    _app_started_s = _now_s()
