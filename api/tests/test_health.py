"""Tests for the redesigned health & diagnostics endpoints."""

from __future__ import annotations

import pytest

STATUSES = {"passing", "degraded", "failing", "skipped", "not_tested"}


@pytest.mark.asyncio
async def test_root_redirects_to_docs(client):
    """Root should redirect to the API documentation, not a generic body."""
    resp = await client.get("/")
    assert resp.status_code == 200  # client follows redirects
    assert resp.url.path == "/api/docs"
    assert "swagger" in resp.text.lower() or "docs" in resp.text.lower()


@pytest.mark.asyncio
async def test_health_live_is_cheap_and_positive(client):
    resp = await client.get("/health/live")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "passing"
    assert data["liveness"] is True
    assert data["schemaVersion"] == "1.0"


@pytest.mark.asyncio
async def test_health_ready_returns_schema(client):
    resp = await client.get("/health/ready")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in STATUSES
    assert data["schemaVersion"] == "1.0"


@pytest.mark.asyncio
async def test_health_snapshot_structured(client):
    """Health should distinguish subsystem states and never be 'ok'-only."""
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in STATUSES
    assert data["schemaVersion"] == "1.0"
    assert "version" in data
    assert "env" in data
    assert "uptime" in data
    # Per-subsystem checks exist
    for key in ("storage", "mongodb", "binaries", "auth", "config"):
        assert key in data["checks"], f"missing check: {key}"
        assert data["checks"][key]["status"] in STATUSES
    assert data["summary"]  # status counts
    # No secrets / private paths leaked
    body_text = resp.text
    assert "mongodb+srv" not in body_text
    assert "pk_" not in body_text and "sk_" not in body_text and "whsec" not in body_text


@pytest.mark.asyncio
async def test_health_includes_spotify_and_disk_summaries(client):
    resp = await client.get("/api/health")
    data = resp.json()
    assert "spotify" in data
    assert "connected" in data["spotify"]
    storage = data["checks"]["storage"]
    # Audio file count is always reported; free-space totals are present
    # wherever the storage path actually exists.
    assert "audioFiles" in storage
    if "diskFreeBytes" in storage:
        assert "diskTotalBytes" in storage


@pytest.mark.asyncio
async def test_health_diag_requires_auth(client_anon, client):
    # Anonymous must be rejected…
    resp = await client_anon.get("/api/health/diag")
    assert resp.status_code == 401

    # …authenticated requests get fresh subsystem diagnostics
    resp = await client.get("/api/health/diag")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in STATUSES
    assert data["diagnostics"]["forceRefreshedAt"]
    binaries = data["checks"]["binaries"].get("binaries", {})
    assert "ytdlp" in binaries and "ffmpeg" in binaries


@pytest.mark.asyncio
async def test_version_endpoint(client):
    resp = await client.get("/api/version")
    assert resp.status_code == 200
    data = resp.json()
    assert data["version"]
    assert data["name"] == "Rheoson"


@pytest.mark.asyncio
async def test_mongodb_failure_degrades_but_does_not_kill_health(client, monkeypatch):
    """A database that is down must be reported as degraded, not crash or
    hang the health endpoint."""
    import app.core.health as h

    async def fake_check() -> dict:
        return h._check_entry("degraded", "not connected")

    monkeypatch.setattr(h, "_check_mongodb", fake_check)
    monkeypatch.setattr(h, "_PROBE_TTL", -1.0)  # force refresh on next read
    monkeypatch.setattr(h, "_probe_cache", {"ts": 0.0, "checks": {}})

    resp = await client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["checks"]["mongodb"]["status"] == "degraded"
    assert data["status"] in ("degraded", "failing")


def test_skipped_probes_never_mask_a_real_failure():
    """One unconfigured optional dependency must not hide a failing subsystem.

    `skipped`/`not_tested` are informational — they mean a probe did not run,
    not that a subsystem is unhealthy — but they were ranked *above* `failing`,
    so an instance with Clerk (or Redis) unconfigured reported its overall
    status as `skipped` while the database check in the same payload said
    `degraded`. The module docstring promises a failing subsystem degrades the
    overall status, so pin it.
    """
    import app.core.health as h

    assert h._worst(["skipped", "degraded"]) == "degraded"
    assert h._worst(["skipped", "failing"]) == "failing"
    assert h._worst(["not_tested", "passing"]) == "passing"
    assert h._worst(["not_tested", "failing", "skipped"]) == "failing"
    # Every probe skipped: admit nothing ran rather than claiming health.
    assert h._worst(["skipped", "skipped"]) == "skipped"
    assert h._worst([]) == "passing"


@pytest.mark.asyncio
async def test_redis_is_not_reported_working_just_because_a_url_is_set(monkeypatch):
    """A set REDIS_URL must not be reported as a live service.

    `settings.has_redis` is `bool(REDIS_URL)` — a string check — and no code
    path imported a Redis client, so /api/health asserted a working cache that
    did not exist. An unconfigured Redis is skipped, not "passing".
    """
    import app.core.health as h
    from app.core.config import settings

    monkeypatch.setattr(settings, "REDIS_URL", "")

    entry = await h._check_redis()

    assert entry["status"] == "skipped"


@pytest.mark.asyncio
async def test_redis_unreachable_is_degraded_without_leaking_credentials(monkeypatch):
    """A Redis URL carries its password, and client errors quote the URL.

    Health output is served unauthenticated, so the failure detail must name
    neither — a configured-but-unreachable Redis is a degraded subsystem, not
    a credential disclosure.
    """
    import redis.asyncio as aioredis

    import app.core.health as h
    from app.core.config import settings

    url = "redis://:sup3rs3cret@redis.invalid:6379/0"
    monkeypatch.setattr(settings, "REDIS_URL", url)

    def boom(*_args, **_kwargs):
        raise ConnectionError(f"Error connecting to {url}")

    monkeypatch.setattr(aioredis, "from_url", boom)

    entry = await h._check_redis()

    assert entry["status"] == "degraded"
    assert "sup3rs3cret" not in str(entry)
    assert "redis.invalid" not in str(entry)


@pytest.mark.asyncio
async def test_health_separates_redis_configuration_from_reachability(client, monkeypatch):
    """The services block reports both facts instead of one misleading bool."""
    import app.core.health as h
    from app.core.config import settings

    monkeypatch.setattr(settings, "REDIS_URL", "")
    monkeypatch.setattr(h, "_PROBE_TTL", -1.0)
    monkeypatch.setattr(h, "_probe_cache", {"ts": 0.0, "checks": {}})

    resp = await client.get("/api/health")

    assert resp.status_code == 200
    assert resp.json()["services"]["redis"] == {
        "configured": False,
        "reachable": False,
    }


@pytest.mark.asyncio
async def test_config_check_flags_missing_webhook_secret(monkeypatch):
    """A Clerk-enabled production instance without CLERK_WEBHOOK_SECRET
    cannot sync users to MongoDB — the config check must say so instead of
    reporting 'valid'."""
    import app.core.health as h
    from app.core.config import settings

    monkeypatch.setattr(settings, "ENV", "production")
    monkeypatch.setattr(settings, "SECRET_KEY", "a-real-looking-secret")
    monkeypatch.setattr(settings, "CLERK_SECRET_KEY", "sk_test_xxx")
    monkeypatch.setattr(settings, "CLERK_PUBLISHABLE_KEY", "pk_test_xxx")
    monkeypatch.setattr(settings, "CLERK_WEBHOOK_SECRET", "")

    entry = await h._check_config()
    assert entry["status"] == "failing"
    assert "CLERK_WEBHOOK_SECRET missing" in entry["detail"]

    # Once the secret is configured the check passes again
    monkeypatch.setattr(settings, "CLERK_WEBHOOK_SECRET", "whsec_xxx")
    entry = await h._check_config()
    assert entry["status"] == "passing", entry


@pytest.mark.asyncio
async def test_mongodb_check_pings_db_not_db_admin(monkeypatch):
    """Regression: the probe used `db.admin.command("ping")`. On a Motor
    *database* `db.admin` is an attribute-fallback *collection*, so every
    live health snapshot reported MongoDB as degraded with
    "MotorCollection object is not callable". It must ping via
    `db.command("ping")` and report passing when the ping succeeds."""
    import app.core.health as h

    class FakeDB:
        def __init__(self) -> None:
            self.pinged = False

        async def command(self, cmd: str) -> dict:
            self.pinged = True
            assert cmd == "ping"
            return {"ok": 1.0}

    fake_db = FakeDB()
    # _check_mongodb does `from app.core import database` at call time, so
    # patch attributes on the real module object.
    import app.core.database as database
    monkeypatch.setattr(database, "db_available", lambda: True)
    monkeypatch.setattr(database, "_db", fake_db)

    entry = await h._check_mongodb()
    assert entry["status"] == "passing", entry
    assert fake_db.pinged is True
    assert "latencyMs" in entry


@pytest.mark.asyncio
async def test_health_accepts_head_requests(client):
    """HEAD /api/health must return 200, not 405.

    Android's CapacitorHttp and some proxies probe with HEAD; a 405 made the
    client-side health poller report the API as unreachable while every GET
    (search, streaming) worked fine — the "You're offline" banner with a
    working app. GET routes that front-ends probe must accept HEAD.
    """
    resp = await client.head("/api/health")
    assert resp.status_code == 200
