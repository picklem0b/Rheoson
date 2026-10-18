"""Doctor router — the caller's own library, scanned and repaired.

The instance-wide doctor lives at `/api/settings/doctor` and is admin-only:
it walks every configured music directory and can delete from it. This router
is the same work without the instance-admin gate, so an ordinary signed-in
account can look after the library it actually streams from.

Two differences make that safe rather than merely convenient:

* every path is resolved and checked to sit inside `MUSIC_DIR`
  (`user_validate_managed_path`) before any syscall touches it;
* repairs re-validate the finding — a file must still look corrupt, a duplicate
  must still be a duplicate, a folder must still be empty — so a stale scan
  cannot be replayed into deleting something that has since become good.

Scans are cached per (account, directory) pair in the service, so reopening the
Doctor screen does not walk the library again.
"""

from __future__ import annotations

import asyncio
from typing import Any, Callable

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core import error_codes
from app.core.config import settings
from app.core.deps import get_current_user
from app.services import library_doctor

router = APIRouter()


class DoctorFixSchema(BaseModel):
    kind: str  # "corrupt" | "duplicate" | "empty-dir" | "empty-dirs"
    path: str | None = None


async def _run(fn: Callable[..., Any], *args: Any) -> Any:
    """Run blocking filesystem work off the event loop, mapping bad paths to 400."""
    try:
        return await asyncio.to_thread(fn, *args)
    except ValueError as e:
        raise error_codes.fail(error_codes.LIBRARY.SCAN_INVALID, 400, append=f": {e}")


@router.get("/user-scan")
async def doctor_user_scan(user: dict = Depends(get_current_user)):
    """Scan the caller's music directory for corrupt files, duplicates and empty folders."""
    return await asyncio.to_thread(library_doctor.scan_user_library, user["sub"])


@router.post("/user-fix")
async def doctor_user_fix(body: DoctorFixSchema, user: dict = Depends(get_current_user)):
    """Repair one reported item, or sweep all of one kind when no path is given."""
    basedir = settings.MUSIC_DIR
    kind = body.kind

    if kind == "corrupt":
        if body.path:
            return await _run(library_doctor.user_delete_corrupt_file, body.path, basedir)
        return await _run(library_doctor.user_delete_all_corrupt, basedir)
    if kind == "duplicate":
        if body.path:
            return await _run(library_doctor.user_delete_duplicate_file, body.path, basedir)
        return await _run(library_doctor.user_delete_all_duplicates, basedir)
    if kind == "empty-dir":
        if not body.path:
            raise error_codes.fail(
                error_codes.LIBRARY.DIR_NOT_FOUND, 400, append=" — the empty-dir fix needs a path"
            )
        return await _run(library_doctor.user_delete_empty_dir, body.path, basedir)
    if kind == "empty-dirs":
        return await _run(library_doctor.user_prune_empty_dirs, basedir)
    raise error_codes.fail(
        error_codes.LIBRARY.SCAN_INVALID, 400, append=f" — unknown fix kind: {kind}"
    )
