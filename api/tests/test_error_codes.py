"""Error-code contract — the registry is the traceability promise.

A user reporting "Download failed [ERROR_CODE: DEX01]" must land on exactly one raise
site. That only holds while: every code is registered, no two codes collide,
every code is well-formed DCCNN, the wire format is stable, and
docs/ERROR_CODES.md stays in sync. These tests pin all of them; breaking any
code breaks the promise, not just a test.
"""

from __future__ import annotations

import re
from pathlib import Path



from app.core import error_codes as ec
from app.main import app
from fastapi.routing import APIRoute

_ERR_RE = re.compile(r"\[ERROR_CODE: ([A-Z]{3}\d{2})\]")


# ── Registry integrity ────────────────────────────────────────


def test_codes_are_unique():
    codes = list(ec.all_codes())
    assert len(codes) == len(set(codes)), "duplicate codes defeat traceability"


def test_every_code_is_well_formed_dccnn():
    for code in ec.all_codes():
        assert ec.CODE_RE.match(code), f"{code} is not DCCNN"


def test_codes_start_with_their_domain_letter():
    """The D in DCCNN — a downloads code always starts with D."""
    for section in (
        ec.AUTH, ec.PLAYLIST, ec.TRACK, ec.DOWNLOAD, ec.STREAM,
        ec.SEARCH, ec.LIBRARY, ec.SETTINGS, ec.WEBHOOK, ec.ARTIST, ec.PLAYBACK,
    ):
        for code in section:
            assert code[0] == section.letter, (
                f"{code} does not start with {section._name}'s domain letter"
            )


def test_domain_letters_are_unique():
    letters = [s.letter for s in (
        ec.AUTH, ec.PLAYLIST, ec.TRACK, ec.DOWNLOAD, ec.STREAM,
        ec.SEARCH, ec.LIBRARY, ec.SETTINGS, ec.WEBHOOK, ec.ARTIST, ec.PLAYBACK,
    )]
    assert len(letters) == len(set(letters)), "two domains share a letter"


def test_every_section_member_is_registered():
    for section in (
        ec.AUTH, ec.PLAYLIST, ec.TRACK, ec.DOWNLOAD, ec.STREAM,
        ec.SEARCH, ec.LIBRARY, ec.SETTINGS, ec.WEBHOOK, ec.ARTIST, ec.PLAYBACK,
    ):
        for code in section:
            assert code in ec.all_codes(), (
                f"{section!r} member {code} has no registered message"
            )


def test_fail_rejects_unregistered_codes():
    try:
        ec.fail("DZZ99")
    except AssertionError:
        pass  # the intended behaviour
    else:
        raise AssertionError("an unregistered code must not raise cleanly")


def test_fail_rejects_malformed_codes():
    for bad in ("40009", "dex01", "DEX1", "DEX012", ""):
        try:
            ec.fail(bad)
        except AssertionError:
            continue
        raise AssertionError(f"malformed code {bad!r} must not raise cleanly")


def test_fail_appends_dynamic_values_without_breaking_the_code():
    exc = ec.fail(ec.DOWNLOAD.JOB_NOT_FOUND, 404, append=": abc")
    assert exc.detail.startswith("Download job not found: abc [ERROR_CODE: DNF01]")
    assert getattr(exc, "error_code") == "DNF01"


# ── Wire format ───────────────────────────────────────────────


def test_detail_suffixed_and_code_field_present():
    exc = ec.fail(ec.DOWNLOAD.FAILED, 500)
    assert exc.detail.endswith("[ERROR_CODE: DEX01]")
    assert exc.status_code == 500
    assert getattr(exc, "error_code") == "DEX01"


# ── Every raise site in the app carries a code ────────────────


def _api_routes() -> list[APIRoute]:
    found, seen, stack = [], set(), [(r, "") for r in app.routes]
    while stack:
        route, prefix = stack.pop()
        if id(route) in seen:
            continue
        seen.add(id(route))
        if isinstance(route, APIRoute):
            found.append(route)
            continue
        ctx = getattr(route, "include_context", None)
        next_prefix = prefix + (getattr(ctx, "prefix", "") or "")
        inner = getattr(route, "original_router", None) or route
        stack.extend(
            (child, next_prefix)
            for child in (getattr(inner, "routes", None) or [])
        )
    return found


def test_router_http_exceptions_all_carry_registry_codes():
    """The only HTTPExceptions without a code are auth bearer validation
    (FastAPI internals) and multi-status edge cases; every user-facing raise
    in a router must come from error_codes.fail()."""
    uncode = []
    for route in _api_routes():
        dep = route.dependant
        for e in getattr(dep, "errors", []) or []:
            pass  # dependant.errors is shape-specific; inspect endpoints instead
        fn = route.endpoint
        import inspect

        try:
            src = inspect.getsource(fn)
        except (OSError, TypeError):
            continue
        for m in re.finditer(r"HTTPException\(([^)]*)\)", src):
            args = m.group(1)
            if "error_codes.fail" in args or "fail(" in args:
                continue
            uncode.append(f"{fn.__name__}: {args.strip()[:80]}")
    assert not uncode, (
        f"raises without a registry code: {uncode}"
    )


# ── Docs stay in sync ─────────────────────────────────────────


def test_docs_error_codes_md_is_in_sync():
    doc = Path(__file__).resolve().parents[2] / "docs" / "ERROR_CODES.md"
    assert doc.exists(), "docs/ERROR_CODES.md is the traceability map"
    text = doc.read_text()
    for code, message in ec.all_codes().items():
        assert f"[ERROR_CODE: {code}]" in text, f"{code} missing from ERROR_CODES.md"
        assert message.split("—")[0].strip()[:12].lower() in text.lower(), (
            f"message for {code} drifted in ERROR_CODES.md"
        )
    # And nothing stale: every code in the doc must still exist.
    for code in _ERR_RE.findall(text):
        assert code in ec.all_codes(), f"{code} in docs but not in the registry"
