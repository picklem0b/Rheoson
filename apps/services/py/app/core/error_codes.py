"""DCCNN error codes, loaded from the shared TypeScript registry.

The registry is authored once in ``packages/shared/src/error-codes.ts`` and
exported to ``packages/shared/generated/error-codes.json``. This module reads
that artifact — it never re-declares codes. If the file cannot be found the
engine still runs, using a small inline fallback for the codes it raises, and
logs which codes resolved from the fallback so the gap is visible rather than
silent.

Wire format (frozen): ``<message> [ERROR_CODE: DCCNN]``.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

import structlog

log = structlog.get_logger()

WIRE_PREFIX = "[ERROR_CODE"

#: Codes the engine raises itself. Present so a missing artifact degrades to
#: correct messages instead of raw ids; the artifact stays the source of truth
#: for everything else.
_FALLBACK_MESSAGES: dict[str, str] = {
    "SVA03": "Invalid track id",
    "SNF01": "Track not found locally and the id is not a valid remote track",
    "SUP01": "Track not available",
    "SUP02": "Could not stream this track. YouTube may be rate-limiting",
    "DEN02": "The download engine is not installed on this server",
    "DEN03": "Audio conversion is unavailable on this server",
    "DEX01": "Download failed",
}

_codes: dict[str, str] = {}
_source: str = "unset"


def _candidate_paths() -> list[Path]:
    """Where to look for the exported artifact, most specific first."""
    candidates: list[Path] = []
    env = os.environ.get("ERROR_CODES_PATH", "").strip()
    if env:
        candidates.append(Path(env))
    # Container layout: the artifact is copied next to the app.
    candidates.append(Path("/app/error-codes.json"))
    # Repo layout: walk up from this file to the workspace root.
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidates.append(parent / "packages" / "shared" / "generated" / "error-codes.json")
    return candidates


def load() -> dict[str, str]:
    """Load (once) and return the code → message registry."""
    global _codes, _source
    if _codes:
        return _codes

    for path in _candidate_paths():
        try:
            raw = path.read_text(encoding="utf-8")
        except OSError:
            continue
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as e:
            log.warning("error_codes.artifact_invalid", path=str(path), error=str(e))
            continue
        codes = parsed.get("codes")
        if isinstance(codes, dict) and codes:
            _codes = {str(k): str(v) for k, v in codes.items()}
            _source = str(path)
            log.info("error_codes.loaded", path=_source, count=len(_codes))
            return _codes

    # No artifact: fall back, loudly.
    _codes = dict(_FALLBACK_MESSAGES)
    _source = "inline-fallback"
    log.warning(
        "error_codes.artifact_missing",
        using_fallback=len(_codes),
        searched=[str(p) for p in _candidate_paths()][:3],
    )
    return _codes


def source() -> str:
    """Where the registry came from — surfaced by /health so a stale or
    missing artifact is visible instead of mysterious."""
    load()
    return _source


def message(code: str) -> str:
    """Human message for a code; the code itself when unknown.

    Unlike the TypeScript side this never raises: a missing code on the engine
    is a deployment gap, not a programming error, and must not take down a
    request that is otherwise serviceable.
    """
    registry = load()
    known = registry.get(code)
    if known is None:
        log.warning("error_codes.unregistered", code=code)
        return code
    return known


def wire(code: str, detail: Optional[str] = None) -> str:
    """Render ``<message> [ERROR_CODE: DCCNN]`` for the client chip."""
    return f"{detail or message(code)} {WIRE_PREFIX}: {code}]"


def is_registered(code: str) -> bool:
    return code in load()
