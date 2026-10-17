"""Client crash reporting.

The app posts its own crashes here — JS errors, React render failures and
native Android crashes captured by the CrashLog plugin. There is deliberately
no third-party crash service: a stack trace carries file paths, device
details and sometimes track names, and this project's whole premise is that
that data stays on the owner's hardware.

``POST`` is intentionally reachable without a session. The crash worth
catching most is the one at launch, before Clerk has restored a token —
requiring auth there would drop exactly the reports that matter, and a report
that arrives after a failed sign-in has no account to attach to anyway. The
payload is size-capped, truncated field-by-field and rate-limited per IP;
reads and deletion are instance-administration, so they sit behind the same
admin gate as the rest of the diagnostics surface.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.core import error_codes
from app.core.deps import get_current_user, get_optional_user
from app.services import crash_service
from app.routers.settings_router import _require_admin

router = APIRouter()

#: Refuse anything larger before it is parsed field-by-field. A legitimate
#: report is a few KB; the cap exists so a hostile client cannot fill the
#: sidecar with one request.
MAX_BODY_BYTES = 64 * 1024


@router.post("/crash")
async def report_crash(
    request: Request,
    _user: dict | None = Depends(get_optional_user),
):
    """Store one crash report.

    Anonymous on purpose (see the module docstring): the client may be broken
    so badly that it never got a session, and that is precisely the report
    the maintainer wants.
    """
    raw = await request.body()
    if len(raw) > MAX_BODY_BYTES:
        raise error_codes.fail(error_codes.CRASH.REPORT_TOO_LARGE, 413)

    try:
        payload = await request.json()
    except Exception:
        raise error_codes.fail(error_codes.CRASH.INVALID_REPORT, 400, append=": body is not JSON")

    if not isinstance(payload, dict):
        raise error_codes.fail(error_codes.CRASH.INVALID_REPORT, 400, append=": expected an object")

    if not (payload.get("message") or payload.get("stack")):
        raise error_codes.fail(
            error_codes.CRASH.INVALID_REPORT, 400, append=": no message or stack"
        )

    stored = await crash_service.record(payload)
    return {
        "ok": True,
        "fingerprint": stored["fingerprint"],
        "count": stored.get("count", 1),
    }


@router.get("/crash")
async def list_crashes(limit: int = 50, user: dict = Depends(get_current_user)):
    """Recent crash fingerprints, newest first (admin only)."""
    _require_admin(user)
    limit = max(1, min(limit, crash_service.MAX_REPORTS))
    reports = await crash_service.list_reports(limit=limit)
    return {"reports": reports, "count": len(reports)}


@router.delete("/crash")
async def clear_crashes(user: dict = Depends(get_current_user)):
    """Drop every stored report (admin only)."""
    _require_admin(user)
    removed = await crash_service.clear()
    return {"ok": True, "removed": removed}
