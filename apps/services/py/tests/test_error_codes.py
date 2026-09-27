"""The engine's half of the shared DCCNN contract.

The registry is authored in TypeScript and exported to JSON; these tests pin
that this side reads it correctly, renders the frozen wire format, and degrades
predictably when the artifact is absent.
"""

from __future__ import annotations

import json

import pytest

from app.core import error_codes


@pytest.fixture(autouse=True)
def _reset_registry(monkeypatch: pytest.MonkeyPatch) -> None:
    """Each test starts from an unloaded registry so caching cannot mask a bug."""
    error_codes._codes = {}
    error_codes._source = "unset"
    yield
    error_codes._codes = {}
    error_codes._source = "unset"


def test_loads_the_exported_artifact() -> None:
    registry = error_codes.load()
    # The workspace artifact is present in the repo, so the real registry —
    # not the fallback — must be what loads.
    assert error_codes.source().endswith("error-codes.json")
    assert registry["DEX01"] == "Download failed"
    assert registry["SUP01"] == "Track not available"
    assert len(registry) > 100


def test_wire_format_is_frozen() -> None:
    assert error_codes.wire("DEX01") == "Download failed [ERROR_CODE: DEX01]"
    assert (
        error_codes.wire("SUP02")
        == "Could not stream this track. YouTube may be rate-limiting [ERROR_CODE: SUP02]"
    )
    assert error_codes.wire("DEX01", "Custom prefix") == "Custom prefix [ERROR_CODE: DEX01]"


def test_every_engine_raised_code_is_registered() -> None:
    # Codes the engine raises itself must exist in the shared registry: a
    # raised-but-unregistered code is a traceability hole.
    for code in ("SVA03", "SUP01", "SUP02", "DEN02", "DEN03", "DEX01"):
        assert error_codes.is_registered(code), f"{code} missing from the registry"


def test_unknown_code_returns_the_code_and_never_raises() -> None:
    # A missing code is a deployment gap, not a crash: a request that is
    # otherwise serviceable must still complete.
    assert error_codes.message("ZZZ99") == "ZZZ99"
    assert error_codes.wire("ZZZ99") == "ZZZ99 [ERROR_CODE: ZZZ99]"


def test_falls_back_when_the_artifact_is_missing(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    monkeypatch.setenv("ERROR_CODES_PATH", str(tmp_path / "nope.json"))
    # Also hide the repo artifact by pointing the search at a bare directory.
    monkeypatch.setattr(
        error_codes, "_candidate_paths", lambda: [tmp_path / "nope.json"]
    )

    registry = error_codes.load()
    assert error_codes.source() == "inline-fallback"
    assert registry["SUP01"] == "Track not available"
    # The wire format is identical either way — clients cannot tell.
    assert error_codes.wire("SUP01") == "Track not available [ERROR_CODE: SUP01]"


def test_corrupt_artifact_falls_back(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    bad = tmp_path / "error-codes.json"
    bad.write_text("{ not json", encoding="utf-8")
    monkeypatch.setattr(error_codes, "_candidate_paths", lambda: [bad])

    assert error_codes.load()["DEX01"] == "Download failed"
    assert error_codes.source() == "inline-fallback"


def test_artifact_without_codes_key_falls_back(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    empty = tmp_path / "error-codes.json"
    empty.write_text(json.dumps({"wire": "x", "domains": {}}), encoding="utf-8")
    monkeypatch.setattr(error_codes, "_candidate_paths", lambda: [empty])

    assert error_codes.source() == "inline-fallback"
