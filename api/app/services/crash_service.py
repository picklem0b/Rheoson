"""Crash report store.

The Android build has no third-party crash SDK and does not want one: reports
are posted to this instance's own API and kept here. That keeps a stack trace
(believed to include file paths and device details) on hardware the owner
already controls, which is the same reason the rest of the app is
self-hosted.

Storage follows the project's Mongo-plus-sidecar idiom. Reports are always
written to ``MUSIC_DIR/.crashes.json`` — so a Termux install with no database
still collects them, and a crash that takes the *server* down is still
readable from disk afterwards — and mirrored into ``crash_reports`` when Mongo
is available, which is what makes ``GET`` cheap on a busy instance.

Reports are grouped by fingerprint rather than appended one-per-occurrence:
a crash loop can fire the same error hundreds of times, and what the Doctor
needs to show is "this happened 412 times, here is the first and last time",
not 412 identical rows.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import structlog
from datetime import datetime, timezone
from pathlib import Path

from app.core.config import settings
from app.core.database import db_available, get_db

log = structlog.get_logger()

#: Keep the file small enough to survive on a phone: enough history to see
#: patterns, not so much that it becomes the disk problem.
MAX_REPORTS = 200

#: Field caps. A crash report is attacker-controlled input (anyone can POST
#: one), so every string is truncated before it is stored or echoed back.
MAX_MESSAGE = 2000
MAX_STACK = 12000
MAX_CONTEXT_KEYS = 24
MAX_FIELD = 200

_lock = asyncio.Lock()


def _store_path() -> Path:
    return Path(settings.MUSIC_DIR) / ".crashes.json"


def _read_store() -> list[dict]:
    path = _store_path()
    try:
        if not path.exists():
            return []
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _write_store(reports: list[dict]) -> None:
    path = _store_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(path.name + ".tmp")
        tmp.write_text(json.dumps(reports, ensure_ascii=False), encoding="utf-8")
        tmp.replace(path)
    except Exception:
        log.warning("crash.store.write_failed", path=str(path), exc_info=True)


def _clean(value, limit: int) -> str:
    text = "" if value is None else str(value)
    return text[:limit]


def fingerprint_of(report: dict) -> str:
    """Stable id for "the same crash", independent of when it happened.

    The message plus the first stack frame is the standard crash-tracker
    heuristic: enough to separate two different faults, and coarse enough
    that a re-render does not look like a new bug.

    The frame matters more than it looks. Both V8 and the JVM put the message
    on a header line (`Error: Cannot read properties of undefined`) and the
    call site on the following `at …` lines, so a fingerprint built from the
    header alone collapses every distinct fault that shares a message into a
    single row. Prefer a real frame; fall back to the header only when the
    trace has none (a hand-written or truncated report).
    """
    stack = report.get("stack") or ""
    lines = [line.strip() for line in stack.splitlines() if line.strip()]
    first_frame = next((line for line in lines if line.startswith("at ")), "")
    if not first_frame and lines:
        first_frame = lines[0]
    seed = "|".join(
        [
            _clean(report.get("kind"), 32),
            _clean(report.get("message"), MAX_FIELD),
            first_frame[:MAX_FIELD],
        ]
    )
    return hashlib.sha256(seed.encode("utf-8", "replace")).hexdigest()[:16]


def _normalize(payload: dict) -> dict:
    """Shape + truncate an incoming report into the stored document."""
    context = payload.get("context")
    if not isinstance(context, dict):
        context = {}
    context = {
        _clean(k, MAX_FIELD): _clean(v, MAX_FIELD)
        for k, v in list(context.items())[:MAX_CONTEXT_KEYS]
    }

    report = {
        "kind": _clean(payload.get("kind") or "js", 32) or "js",
        "message": _clean(payload.get("message"), MAX_MESSAGE),
        "stack": _clean(payload.get("stack"), MAX_STACK),
        "componentStack": _clean(payload.get("componentStack"), MAX_STACK),
        "platform": _clean(payload.get("platform"), 32),
        "appVersion": _clean(payload.get("appVersion"), 32),
        "deviceModel": _clean(payload.get("deviceModel"), 64),
        "osVersion": _clean(payload.get("osVersion"), 32),
        "userAgent": _clean(payload.get("userAgent"), MAX_FIELD),
        "occurredAt": _clean(payload.get("occurredAt"), 40)
        or datetime.now(timezone.utc).isoformat(),
        "context": context,
        "receivedAt": datetime.now(timezone.utc).isoformat(),
    }
    report["fingerprint"] = _clean(payload.get("fingerprint"), 64) or fingerprint_of(report)
    # Deliberately NOT stored: the account id. A crash report is about the
    # build, not the person, and a report that arrives before sign-in has no
    # sub to attach anyway.
    return report


async def record(payload: dict) -> dict:
    """Store one report, folding a repeat into the existing fingerprint."""
    report = _normalize(payload)

    async with _lock:
        reports = _read_store()
        existing = next(
            (r for r in reports if r.get("fingerprint") == report["fingerprint"]), None
        )
        if existing:
            existing["count"] = int(existing.get("count", 1)) + 1
            existing["lastSeen"] = report["receivedAt"]
            existing["appVersion"] = report["appVersion"] or existing.get("appVersion")
            # A later occurrence may carry a richer stack (source maps, a
            # deeper native trace); keep the longest one seen.
            if len(report["stack"]) > len(existing.get("stack") or ""):
                existing["stack"] = report["stack"]
            stored = existing
        else:
            report["count"] = 1
            report["firstSeen"] = report["receivedAt"]
            report["lastSeen"] = report["receivedAt"]
            reports.append(report)
            stored = report
        # Newest-last in the file; evict the oldest fingerprints first.
        if len(reports) > MAX_REPORTS:
            reports = reports[-MAX_REPORTS:]
        _write_store(reports)

    if db_available():
        try:
            await get_db().crash_reports.update_one(
                {"fingerprint": stored["fingerprint"]},
                {"$set": stored},
                upsert=True,
            )
        except Exception as e:  # noqa: BLE001 — the sidecar already has it
            log.debug("crash.store.mongo_failed", error=str(e))

    log.info(
        "crash.recorded",
        fingerprint=stored["fingerprint"],
        kind=stored["kind"],
        count=stored["count"],
    )
    return stored


async def list_reports(limit: int = 50) -> list[dict]:
    """Most recently seen crashes first."""
    reports: list[dict] = []
    if db_available():
        try:
            cursor = get_db().crash_reports.find({}).sort("lastSeen", -1).limit(limit)
            reports = [doc async for doc in cursor]
        except Exception as e:  # noqa: BLE001 — fall back to the sidecar
            log.debug("crash.list.mongo_failed", error=str(e))
    if not reports:
        reports = _read_store()
    for report in reports:
        report.pop("_id", None)
    reports.sort(key=lambda r: r.get("lastSeen") or "", reverse=True)
    return reports[:limit]


async def clear() -> int:
    """Drop every stored report; returns how many fingerprints were removed."""
    async with _lock:
        count = len(_read_store())
        _write_store([])
    if db_available():
        try:
            await get_db().crash_reports.delete_many({})
        except Exception as e:  # noqa: BLE001 — sidecar already cleared
            log.debug("crash.clear.mongo_failed", error=str(e))
    log.info("crash.cleared", count=count)
    return count
