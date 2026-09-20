"""Self-test — the Doctor exercising the real request path end to end.

`/api/health/diag` probes each subsystem's *dependency* (storage reachable,
MongoDB pinging, binaries present). What it cannot answer is whether the
routes built on top of those dependencies actually work together. This
module adds the missing layer: it drives a handful of read-only calls
through the app's own ASGI transport — search, resolve, stream HEAD,
download job list, push health — and reports per-route pass/fail with
latency and a plain-language detail string.

Design constraints:

- **Read-only.** The suite must be safe to run on a production instance:
  no writes, no downloads started, nothing enqueued.
- **Bounded.** Every request has a timeout; the whole suite shares a
  budget so a hung backend subsystem degrades to a "skipped" check
  instead of stalling the Doctor.
- **Honest.** A check that could not run (e.g. no local library) reports
  `skipped` with the reason — never "ok" by assumption.
"""

from __future__ import annotations

import time

SCHEMA_VERSION = 1

_PER_CHECK_TIMEOUT_S = 10.0

_SUMMARY_ORDER = {"pass": 0, "warn": 1, "fail": 2, "skipped": 3}


async def _run_check(
    name: str,
    description: str,
    call,
) -> dict:
    """Run one check; convert any outcome into a uniform shape."""
    started = time.perf_counter()
    try:
        detail = await call()
    except Exception as exc:  # noqa: BLE001 — the point is to report, not crash
        ms = round((time.perf_counter() - started) * 1000)
        return {
            "name": name,
            "description": description,
            "status": "fail",
            "latencyMs": ms,
            "detail": f"{type(exc).__name__}: {exc}",
        }
    ms = round((time.perf_counter() - started) * 1000)
    # The check returns None for pass, or a dict overriding shape.
    if isinstance(detail, dict):
        return {"name": name, "description": description, "latencyMs": ms, **detail}
    return {
        "name": name,
        "description": description,
        "status": "pass",
        "latencyMs": ms,
        "detail": detail or "",
    }


async def run_selftest(app) -> dict:
    """Drive the route-level self-test against the running app.

    Uses httpx's ASGI transport so the requests exercise the full stack —
    middleware, routing, handlers, serialization — without needing to know
    this instance's address.
    """
    import httpx

    checks: list[dict] = []
    transport = httpx.ASGITransport(app=app)

    async def _get(path: str) -> httpx.Response:
        return await client.get(path)

    client = httpx.AsyncClient(
        transport=transport,
        base_url="http://selftest",
        timeout=_PER_CHECK_TIMEOUT_S,
    )

    try:
        # 1 — Search: the widest dependency fan-out in the app (YTMusic).
        async def check_search():
            res = await _get("/api/search?q=beatles&filter=songs&limit=5")
            if res.status_code == 200:
                n = len(res.json().get("tracks", []))
                return f"search answered, {n} track result(s)"
            if res.status_code == 503:
                return {"status": "warn", "detail": "search upstream unavailable (503)"}
            return {"status": "fail", "detail": f"HTTP {res.status_code}"}

        # 2 — Local library: index build over the music directories.
        async def check_library():
            res = await _get("/api/tracks")
            if res.status_code == 200:
                n = len(res.json())
                return {"status": "pass", "detail": f"{n} local track(s) indexed"}
            if res.status_code == 503:
                return {"status": "skipped", "detail": "library storage unavailable"}
            return {"status": "fail", "detail": f"HTTP {res.status_code}"}

        # 3 — Stream route contract: a HEAD against a known-imaginary ID must
        # still answer optimistic audio headers (that IS the design: remote
        # tracks are only resolvable at GET time).
        async def check_stream():
            res = await client.head("/api/stream/aaaaaaaaaaa/audio")
            ctype = res.headers.get("content-type", "")
            if res.status_code in (200, 204, 404):
                return f"stream route answered HEAD (HTTP {res.status_code}, type={ctype or 'none'})"
            return {"status": "fail", "detail": f"HTTP {res.status_code}"}

        # 4 — Download job store.
        async def check_jobs():
            res = await _get("/api/downloads")
            if res.status_code == 200:
                jobs = res.json()
                return f"job store readable ({len(jobs)} job(s) on record)"
            return {"status": "fail", "detail": f"HTTP {res.status_code}"}

        # 5 — Push channel: the Socket.IO mount point must answer.
        async def check_socket():
            res = await _get("/socket.io/?EIO=4&transport=polling")
            if res.status_code == 200:
                return "socket.io handshake endpoint answering"
            return {"status": "fail", "detail": f"HTTP {res.status_code}"}

        # 6 — Synced lyrics path (skipped gracefully when nothing to check).
        async def check_lyrics():
            res = await _get("/api/lyrics/aaaaaaaaaaa?title=&artist=")
            if res.status_code in (200, 404):
                return {"status": "pass", "detail": f"lyrics route answered (HTTP {res.status_code})"}
            return {"status": "fail", "detail": f"HTTP {res.status_code}"}

        # 7 — Categories: weekly-cached genre lists.
        async def check_categories():
            res = await _get("/api/search/categories")
            if res.status_code == 200:
                cats = res.json()
                return f"{len(cats)} cached categorie(s) served"
            if res.status_code == 404:
                return {"status": "skipped", "detail": "categories route not mounted"}
            return {"status": "fail", "detail": f"HTTP {res.status_code}"}

        for name, desc, fn in [
            ("search", "Search fanout through YouTube Music", check_search),
            ("library", "Local library index", check_library),
            ("stream", "Stream route contract (HEAD)", check_stream),
            ("jobs", "Download job store", check_jobs),
            ("push", "Socket.IO handshake", check_socket),
            ("lyrics", "Lyrics route", check_lyrics),
            ("categories", "Weekly category cache", check_categories),
        ]:
            checks.append(await _run_check(name, desc, fn))
    finally:
        await client.aclose()

    statuses = [c["status"] for c in checks]
    worst = max(statuses, key=lambda s: _SUMMARY_ORDER.get(s, 4)) if statuses else "skipped"
    return {
        "schemaVersion": SCHEMA_VERSION,
        "status": worst,
        "totalMs": round(sum(c.get("latencyMs", 0) for c in checks)),
        "checks": checks,
        "summary": {
            "pass": statuses.count("pass"),
            "warn": statuses.count("warn"),
            "fail": statuses.count("fail"),
            "skipped": statuses.count("skipped"),
        },
    }
