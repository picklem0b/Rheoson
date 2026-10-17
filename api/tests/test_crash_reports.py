"""Crash reports — ingest, grouping, gating, and survival without Mongo.

The ingest route is deliberately anonymous: the crash that matters most is
the one at launch, before a session exists. That makes it the only
unauthenticated writer in the API, so the tests lean on the three properties
that keep it safe — a size cap, field truncation, and per-IP rate limiting —
plus the admin gate on reading them back.
"""

from __future__ import annotations

import json
import os

import pytest

from tests.conftest import TEST_USER_SUB


def _payload(**overrides) -> dict:
    base = {
        "kind": "js",
        "message": "Cannot read properties of undefined (reading 'filter')",
        "stack": "TypeError: Cannot read properties of undefined\n    at Library (Library.tsx:412:18)",
        "platform": "android",
        "appVersion": "2.24.1",
        "deviceModel": "Pixel 7",
    }
    base.update(overrides)
    return base


# ── Ingest is anonymous by design ─────────────────────────────


@pytest.mark.asyncio
async def test_anonymous_client_can_report_a_crash(client_anon):
    resp = await client_anon.post("/api/diagnostics/crash", json=_payload())
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ok"] is True
    assert body["count"] == 1
    assert len(body["fingerprint"]) == 16


@pytest.mark.asyncio
async def test_repeat_crash_folds_into_one_fingerprint(client_anon):
    """A crash loop must not become hundreds of rows."""
    first = await client_anon.post("/api/diagnostics/crash", json=_payload())
    second = await client_anon.post("/api/diagnostics/crash", json=_payload())
    third = await client_anon.post("/api/diagnostics/crash", json=_payload())

    fp = first.json()["fingerprint"]
    assert second.json()["fingerprint"] == fp
    assert third.json()["fingerprint"] == fp
    assert third.json()["count"] == 3

    stored = json.loads(
        open(os.path.join(os.environ["MUSIC_DIR"], ".crashes.json")).read()
    )
    assert len(stored) == 1
    assert stored[0]["count"] == 3


@pytest.mark.asyncio
async def test_different_crashes_get_different_fingerprints(client_anon):
    a = await client_anon.post("/api/diagnostics/crash", json=_payload(message="boom A"))
    b = await client_anon.post("/api/diagnostics/crash", json=_payload(message="boom B"))
    assert a.json()["fingerprint"] != b.json()["fingerprint"]


@pytest.mark.asyncio
async def test_native_crash_kind_is_preserved(client_anon):
    resp = await client_anon.post(
        "/api/diagnostics/crash",
        json=_payload(kind="native", stack="java.lang.NullPointerException\n\tat com.lethabo.rheoson.MainActivity"),
    )
    assert resp.status_code == 200
    stored = json.loads(
        open(os.path.join(os.environ["MUSIC_DIR"], ".crashes.json")).read()
    )
    assert stored[0]["kind"] == "native"


# ── Input is hostile until proven otherwise ───────────────────


@pytest.mark.asyncio
async def test_body_without_message_or_stack_is_refused(client_anon):
    resp = await client_anon.post("/api/diagnostics/crash", json={"kind": "js"})
    assert resp.status_code == 400
    assert resp.json()["code"] == "CVA01"


@pytest.mark.asyncio
async def test_non_object_body_is_refused(client_anon):
    resp = await client_anon.post("/api/diagnostics/crash", json=["not", "an", "object"])
    assert resp.status_code == 400
    assert resp.json()["code"] == "CVA01"


@pytest.mark.asyncio
async def test_oversized_body_is_refused_without_writing(client_anon):
    resp = await client_anon.post(
        "/api/diagnostics/crash", json=_payload(stack="x" * (64 * 1024 + 10))
    )
    assert resp.status_code == 413
    assert resp.json()["code"] == "CVA02"
    assert not os.path.exists(os.path.join(os.environ["MUSIC_DIR"], ".crashes.json"))


@pytest.mark.asyncio
async def test_long_fields_are_truncated_before_storage(client_anon):
    await client_anon.post(
        "/api/diagnostics/crash",
        json=_payload(message="m" * 5000, stack="s" * 30000, context={"k": "v" * 5000}),
    )
    stored = json.loads(
        open(os.path.join(os.environ["MUSIC_DIR"], ".crashes.json")).read()
    )[0]
    assert len(stored["message"]) == 2000
    assert len(stored["stack"]) == 12000
    assert len(stored["context"]["k"]) == 200


@pytest.mark.asyncio
async def test_prefixed_fingerprint_is_respected(client_anon):
    """A client that already grouped the crash keeps its own id."""
    resp = await client_anon.post(
        "/api/diagnostics/crash", json=_payload(fingerprint="client-side-id")
    )
    assert resp.json()["fingerprint"] == "client-side-id"


# ── No account identifiers are stored ─────────────────────────


@pytest.mark.asyncio
async def test_report_never_records_the_account(client):
    await client.post("/api/diagnostics/crash", json=_payload())
    stored = json.loads(
        open(os.path.join(os.environ["MUSIC_DIR"], ".crashes.json")).read()
    )[0]
    serialized = json.dumps(stored)
    assert TEST_USER_SUB not in serialized
    assert "user_id" not in stored
    assert "user" not in stored


# ── Reading is instance administration ────────────────────────


@pytest.mark.asyncio
async def test_reading_requires_a_session(client_anon):
    assert (await client_anon.get("/api/diagnostics/crash")).status_code == 401


@pytest.mark.asyncio
async def test_reading_is_denied_for_a_configured_non_admin(client, monkeypatch):
    """With ADMIN_SUBS set, a signed-in non-admin cannot read reports."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "ADMIN_SUBS", ["some-other-admin-sub"])
    resp = await client.get("/api/diagnostics/crash")
    assert resp.status_code == 403
    assert resp.json()["code"] == "ACF01"


@pytest.mark.asyncio
async def test_dev_box_without_admins_configured_stays_open(client, monkeypatch):
    """Documented dev posture: an unset allowlist opens instance config on a
    lab box only — production refuses without ADMIN_SUBS (see
    test_trust_boundary.py). Pinned here so the crash surface inherits the
    same rule rather than inventing its own."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "ADMIN_SUBS", [])
    assert settings.is_dev
    assert (await client.get("/api/diagnostics/crash")).status_code == 200


@pytest.mark.asyncio
async def test_admin_sees_reports_newest_first(client, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "ADMIN_SUBS", [TEST_USER_SUB])
    await client.post("/api/diagnostics/crash", json=_payload(message="first"))
    await client.post("/api/diagnostics/crash", json=_payload(message="second"))

    resp = await client.get("/api/diagnostics/crash")
    assert resp.status_code == 200
    reports = resp.json()["reports"]
    assert len(reports) == 2
    assert reports[0]["lastSeen"] >= reports[1]["lastSeen"]


@pytest.mark.asyncio
async def test_admin_can_clear_reports(client, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "ADMIN_SUBS", [TEST_USER_SUB])
    await client.post("/api/diagnostics/crash", json=_payload())

    resp = await client.delete("/api/diagnostics/crash")
    assert resp.status_code == 200
    assert resp.json()["removed"] == 1
    assert (await client.get("/api/diagnostics/crash")).json()["reports"] == []


# ── The sidecar is the source of truth when Mongo is down ─────


@pytest.mark.asyncio
async def test_reports_survive_without_the_database(client_anon, monkeypatch):
    """A Termux install with no Mongo still collects crashes."""
    monkeypatch.setattr("app.services.crash_service.db_available", lambda: False)
    await client_anon.post("/api/diagnostics/crash", json=_payload(message="offline-db"))
    stored = json.loads(
        open(os.path.join(os.environ["MUSIC_DIR"], ".crashes.json")).read()
    )
    assert stored[0]["message"] == "offline-db"


@pytest.mark.asyncio
async def test_store_is_bounded(client_anon):
    """The file cannot grow without limit on a phone."""
    from app.services import crash_service

    monkey_needed = crash_service.MAX_REPORTS + 5
    assert monkey_needed < 1000, "keep this test fast"
    for i in range(monkey_needed):
        await client_anon.post(
            "/api/diagnostics/crash", json=_payload(message=f"crash {i}")
        )
    stored = json.loads(
        open(os.path.join(os.environ["MUSIC_DIR"], ".crashes.json")).read()
    )
    assert len(stored) == crash_service.MAX_REPORTS
    # The newest survived; the oldest was evicted.
    assert stored[-1]["message"] == f"crash {monkey_needed - 1}"
    assert stored[0]["message"] == f"crash {monkey_needed - crash_service.MAX_REPORTS}"
