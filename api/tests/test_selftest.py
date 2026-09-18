"""The /api/health/selftest route contract.

The Doctor's route self-test drives real read-only requests through the
running app. These tests pin the parts that matter if it is ever trusted
for diagnosis: it always answers 200 with a well-formed payload (a probe
that crashes is worse than no probe), every check carries a known status,
and the summary arithmetic agrees with the check list.
"""

from __future__ import annotations

BASE = "/api/health/selftest"

_VALID = {"pass", "warn", "fail", "skipped"}


async def _run_selftest(client):
    res = await client.get(BASE)
    assert res.status_code == 200
    body = res.json()
    for key in ("schemaVersion", "status", "totalMs", "checks", "summary"):
        assert key in body, f"missing {key}"
    assert isinstance(body["checks"], list)
    assert body["checks"], "selftest should report at least one check"
    assert body["status"] in _VALID
    return body


async def test_selftest_answers_with_wellformed_payload(client):
    body = await _run_selftest(client)
    for check in body["checks"]:
        assert {"name", "description", "status"} <= set(check)
        assert check["status"] in _VALID, f"check {check['name']}: bad status"
        assert isinstance(check.get("detail", ""), str)


async def test_selftest_summary_matches_checks(client):
    body = await _run_selftest(client)
    summary = body["summary"]
    assert summary["pass"] + summary["warn"] + summary["fail"] + summary["skipped"] == len(
        body["checks"]
    )
    # The aggregate status must be the worst check, not the best — a Doctor
    # that reports "pass" while any check failed is lying.
    order = {"pass": 0, "warn": 1, "fail": 2, "skipped": 3}
    worst_by_order = max(
        (order[c["status"]] for c in body["checks"]), default=0
    )
    worst = next(k for k, v in order.items() if v == worst_by_order)
    assert body["status"] == worst
