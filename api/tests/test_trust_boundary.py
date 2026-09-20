"""Environment validation and instance-administration gates.

Two rules that only matter when they are wrong:

* An unrecognised ``ENV`` must select the deployed posture, not the
  development one. A typo would otherwise hand a publicly reachable server an
  insecure secret and a relaxed Clerk requirement.
* Operations that touch the shared music library are instance administration,
  so they are limited to the configured admin rather than any signed-in
  account.
"""

from __future__ import annotations

import json

import pytest

from app.core.config import settings, validate_startup


# ── Environment selection fails closed ────────────────────────

def test_development_aliases_are_recognised(monkeypatch):
    for value in ("development", "dev", "local", "test"):
        monkeypatch.setattr(settings, "ENV", value)
        assert settings.is_dev is True
        assert settings.is_prod is False
        assert settings.env_recognised is True


def test_deployed_environment_names_are_recognised(monkeypatch):
    for value in ("production", "prod", "staging"):
        monkeypatch.setattr(settings, "ENV", value)
        assert settings.is_prod is True
        assert settings.is_dev is False
        assert settings.env_recognised is True


def test_case_and_whitespace_do_not_change_the_posture(monkeypatch):
    monkeypatch.setattr(settings, "ENV", "  Production ")
    assert settings.is_prod is True
    assert settings.env_recognised is True


def test_unrecognised_environment_fails_closed(monkeypatch):
    """`ENV=prodction` must not silently become a development server."""
    monkeypatch.setattr(settings, "ENV", "prodction")
    assert settings.is_prod is True, "a typo must select the deployed posture"
    assert settings.is_dev is False
    assert settings.env_recognised is False
    with pytest.raises(SystemExit):
        validate_startup()


# ── Clerk token issuer ────────────────────────────────────────

def test_issuer_matching_is_host_exact(monkeypatch):
    """A host that merely contains "clerk.com" must not be accepted."""
    from app.core.auth import _issuer_allowed

    monkeypatch.setattr(settings, "CLERK_ISSUER", "")
    assert _issuer_allowed("https://glad-tuna-9004.clerk.accounts.dev")
    assert _issuer_allowed("https://clerk.accounts.dev")
    assert _issuer_allowed("https://clerk.some-instance.clerk.com")

    assert not _issuer_allowed("https://clerk.com.attacker.tld")
    assert not _issuer_allowed("https://clerk.accounts.dev.attacker.tld")
    assert not _issuer_allowed("https://attacker.tld/clerk.com")
    assert not _issuer_allowed("http://clerk.accounts.dev"), "issuer must be https"
    assert not _issuer_allowed("")


def test_configured_issuer_pins_a_custom_domain(monkeypatch):
    from app.core.auth import _issuer_allowed

    monkeypatch.setattr(settings, "CLERK_ISSUER", "https://clerk.rheoson.app")
    assert _issuer_allowed("https://clerk.rheoson.app")
    assert not _issuer_allowed("https://glad-tuna-9004.clerk.accounts.dev")


# ── Webhook replay protection ─────────────────────────────────

@pytest.mark.asyncio
async def test_webhook_deliveries_are_claimed_once(monkeypatch):
    """Svix retries deliver the same event twice; it must be handled once."""
    import app.routers.clerk_webhook_router as wh

    monkeypatch.setattr("app.core.database.db_available", lambda: True)

    assert await wh._claim_event("msg_once") is True
    assert await wh._claim_event("msg_once") is False, "a replay was not ignored"
    assert await wh._claim_event("msg_other") is True


# ── Library repairs are instance administration ───────────────

@pytest.mark.asyncio
async def test_library_repairs_require_an_admin(client, monkeypatch):
    """A signed-in non-admin cannot scan or repair the shared library."""
    monkeypatch.setattr(settings, "ENV", "production")
    monkeypatch.setattr(settings, "ADMIN_SUBS", [])

    scan = await client.get("/api/settings/doctor/scan")
    assert scan.status_code == 403, scan.text

    fix = await client.post(
        "/api/settings/doctor/fix", json={"kind": "corrupt", "path": "/nope"}
    )
    assert fix.status_code == 403, fix.text


@pytest.mark.asyncio
async def test_library_scan_allowed_for_a_configured_admin(client, monkeypatch):
    from tests.conftest import TEST_USER_SUB

    monkeypatch.setattr(settings, "ENV", "production")
    monkeypatch.setattr(settings, "ADMIN_SUBS", [TEST_USER_SUB])

    scan = await client.get("/api/settings/doctor/scan")
    assert scan.status_code == 200, scan.text


# ── Download jobs are owner-scoped ────────────────────────────
# Jobs live in process-global state, so the service — not just the router —
# has to filter by owner. The route-level tests below exercise that without
# spawning a real download, since enqueueing starts a yt-dlp subprocess.

def test_job_list_is_scoped_to_its_owner():
    from app.services import download_service as ds

    mine = ds._new_job("t1", "A", "X", "", "mp3", "320", owner="user_a")
    other = ds._new_job("t2", "B", "Y", "", "mp3", "320", owner="user_b")
    ds._jobs[mine["id"]] = mine
    ds._jobs[other["id"]] = other
    try:
        # Asserted by membership rather than exact equality: jobs with no
        # recorded owner stay visible to everyone by design, and the job store
        # is shared process state.
        seen_a = {j["id"] for j in ds.get_all_jobs(owner="user_a")}
        assert mine["id"] in seen_a
        assert other["id"] not in seen_a

        seen_b = {j["id"] for j in ds.get_all_jobs(owner="user_b")}
        assert other["id"] in seen_b
        assert mine["id"] not in seen_b

        assert ds.get_job(other["id"], owner="user_a") is None
        assert ds.get_job(other["id"], owner="user_b") is not None
    finally:
        ds._jobs.pop(mine["id"], None)
        ds._jobs.pop(other["id"], None)


@pytest.mark.asyncio
async def test_another_account_cannot_cancel_or_delete_a_job():
    from app.services import download_service as ds

    job = ds._new_job("t1", "A", "X", "", "mp3", "320", owner="user_a")
    ds._jobs[job["id"]] = job
    try:
        assert await ds.cancel_job(job["id"], owner="user_b") is False
        assert await ds.delete_job(job["id"], owner="user_b") is False
        assert ds._jobs.get(job["id"]) is not None, "the job was removed anyway"
    finally:
        ds._jobs.pop(job["id"], None)


def test_jobs_without_an_owner_stay_reachable():
    """Jobs recorded before ownership existed must not be stranded."""
    from app.services import download_service as ds

    legacy = ds._new_job("t3", "C", "Z", "", "mp3", "320")
    ds._jobs[legacy["id"]] = legacy
    try:
        assert ds.get_job(legacy["id"], owner="anyone") is not None
    finally:
        ds._jobs.pop(legacy["id"], None)


def test_job_persistence_is_atomic(tmp_path, monkeypatch):
    """A crash mid-write must never leave an unreadable jobs file."""
    from app.services import download_service as ds

    target = tmp_path / ".download_jobs.json"
    monkeypatch.setattr(ds, "_JOBS_FILE", target)

    ds._persist_jobs()

    assert json.loads(target.read_text()) == ds._jobs
    leftovers = [p.name for p in tmp_path.iterdir() if p.name != target.name]
    assert leftovers == [], f"temp files were left behind: {leftovers}"
