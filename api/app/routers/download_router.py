from __future__ import annotations
import re
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from app.core.deps import get_current_user
from app.core import error_codes
from app.schemas.download_schema import DownloadRequestSchema, DownloadJobSchema
from app.services.download_service import (
    enqueue_download, get_all_jobs, get_job,
    cancel_job, retry_job, delete_job,
)

# Every route here requires a verified session and scopes its job list to that
# session's owner. Jobs are process-global state, so an unscoped list (or an
# anonymous cancel) would leak and mutate other accounts' downloads.

# redirect_slashes=False prevents FastAPI from doing a 307 redirect from
# POST /api/downloads → POST /api/downloads/ which causes the client to
# follow with GET and lose the POST body.
router = APIRouter(redirect_slashes=False)

# Validate UUID format for job IDs
_UUID_RE = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.IGNORECASE)


def _validate_job_id(job_id: str) -> str:
    """Validate and sanitize job ID to prevent injection."""
    job_id = job_id.strip()
    if not job_id or len(job_id) > 64:
        raise error_codes.fail(error_codes.DOWNLOAD.INVALID_JOB_ID, 400)
    # Jobs are created with uuid4(); reject anything that isn't that shape so
    # malformed IDs get a clear 400 before the 404 lookup.
    if not _UUID_RE.match(job_id):
        raise error_codes.fail(error_codes.DOWNLOAD.INVALID_JOB_ID, 400, append=" format")
    return job_id


def _validate_custom_path(custom_path: Optional[str]) -> None:
    """Downloads land where the user says, but never outside the configured
    music directories. Without this an authenticated user could make the
    server write downloaded audio anywhere on disk (arbitrary file write
    on a shared deployment) via ../ traversal or an absolute path."""
    if not custom_path or not custom_path.strip():
        return
    from pathlib import Path
    from app.core.config import settings
    from app.routers.settings_router import _is_under

    resolved = Path(custom_path.strip()).expanduser().resolve()
    bases = [Path(d).resolve() for d in settings.all_music_dirs_configured]
    if not any(_is_under(resolved, base) for base in bases):
        raise error_codes.fail(error_codes.DOWNLOAD.PATH_OUTSIDE, 400)


@router.post("", response_model=DownloadJobSchema, status_code=202)
@router.post("/", response_model=DownloadJobSchema, status_code=202, include_in_schema=False)
async def start_download(req: DownloadRequestSchema, user: dict = Depends(get_current_user)):
    if not req.trackId and not req.url:
        raise error_codes.fail(error_codes.DOWNLOAD.TARGET_REQUIRED, 400)

    # Validate URL format if provided
    if req.url:
        req.url = req.url.strip()
        if len(req.url) > 2048:
            raise error_codes.fail(error_codes.DOWNLOAD.URL_TOO_LONG, 400)
        if not re.match(r'^https?://', req.url, re.IGNORECASE):
            raise error_codes.fail(error_codes.DOWNLOAD.INVALID_URL, 400)

        # Only known media hosts may be downloaded server-side (SSRF guard).
        from app.services.netguard import ensure_safe_media_url
        try:
            ensure_safe_media_url(req.url)
        except ValueError as e:
            raise error_codes.fail(error_codes.DOWNLOAD.INVALID_URL, 400, append=f": {e}")

    # Validate track ID format if provided
    if req.trackId:
        req.trackId = req.trackId.strip()
        if len(req.trackId) > 20:
            raise error_codes.fail(error_codes.DOWNLOAD.INVALID_TRACK_ID, 400)

    # Never allow downloads to land outside the configured music dirs
    _validate_custom_path(req.customPath)

    job = await enqueue_download(
        track_id=req.trackId,
        url=req.url,
        fmt=req.format,
        quality=req.quality,
        embed_artwork=req.embedArtwork,
        embed_lyrics=req.embedLyrics,
        embed_metadata=req.embedMetadata,
        file_naming=req.fileNaming,
        custom_path=req.customPath,
        retries=req.retries,
        speed_limit=req.speedLimit,
        concurrency=req.concurrency,
        owner=user.get("sub"),
    )
    return job


@router.get("", response_model=list[DownloadJobSchema])
@router.get("/", response_model=list[DownloadJobSchema], include_in_schema=False)
async def list_downloads(user: dict = Depends(get_current_user)):
    return get_all_jobs(owner=user.get("sub"))


@router.get("/{job_id}", response_model=DownloadJobSchema)
async def get_download(job_id: str, user: dict = Depends(get_current_user)):
    job_id = _validate_job_id(job_id)
    job = get_job(job_id, owner=user.get("sub"))
    if not job:
        raise error_codes.fail(error_codes.DOWNLOAD.JOB_NOT_FOUND, 404, append=f": {job_id}")
    return job


@router.post("/{job_id}/cancel")
async def cancel_download(job_id: str, user: dict = Depends(get_current_user)):
    job_id = _validate_job_id(job_id)
    ok = await cancel_job(job_id, owner=user.get("sub"))
    if not ok:
        raise error_codes.fail(error_codes.DOWNLOAD.JOB_NOT_FOUND, 404, append=f": {job_id}")
    return {"ok": True}


class RetryRequest(BaseModel):
    """Optional body for retry: resume controls partial-data continuation.

    None/omitted = auto (resume when staged bytes exist). False = fresh
    download. True = require staged data (silently degrades to fresh when
    none exists — a resume flag with nothing to resume is meaningless).
    """
    resume: Optional[bool] = None


@router.post("/{job_id}/retry", response_model=DownloadJobSchema)
async def retry_download(
    job_id: str,
    body: RetryRequest | None = None,
    user: dict = Depends(get_current_user),
):
    job_id = _validate_job_id(job_id)
    resume = body.resume if body is not None and body.resume is not None else None
    job = await retry_job(job_id, resume=resume, owner=user.get("sub"))
    if not job:
        raise error_codes.fail(error_codes.DOWNLOAD.JOB_NOT_FOUND, 404, append=f": {job_id}")
    return job


@router.delete("/{job_id}")
async def delete_download(job_id: str, user: dict = Depends(get_current_user)):
    job_id = _validate_job_id(job_id)
    if not await delete_job(job_id, owner=user.get("sub")):
        raise error_codes.fail(error_codes.DOWNLOAD.JOB_NOT_FOUND, 404, append=f": {job_id}")
    return {"ok": True}


# ── Batch download ────────────────────────────────────────────

class BatchDownloadRequest(BaseModel):
    track_ids: list[str]
    format:       str = "mp3"
    quality:      str = "320"
    embed_artwork: bool = True
    embed_lyrics:  bool = True
    embed_metadata: bool = True
    file_naming:   str = "artist-title"
    custom_path:   Optional[str] = None
    retries:       int = 3
    speed_limit:   int = 0
    concurrency:   int = 3


@router.post("/batch", response_model=list[DownloadJobSchema], status_code=202)
async def batch_download(req: BatchDownloadRequest, user: dict = Depends(get_current_user)):
    """Start multiple downloads at once (max 20)."""
    if not req.track_ids:
        raise error_codes.fail(error_codes.DOWNLOAD.INVALID_TRACK_LIST, 400)
    if len(req.track_ids) > 20:
        raise error_codes.fail(error_codes.DOWNLOAD.LIMIT_REACHED, 400, append=" (20 per batch)")

    _validate_custom_path(req.custom_path)

    jobs = []
    for track_id in req.track_ids:
        track_id = track_id.strip()
        if not track_id or len(track_id) > 20:
            continue
        job = await enqueue_download(
            track_id=track_id,
            fmt=req.format,
            quality=req.quality,
            embed_artwork=req.embed_artwork,
            embed_lyrics=req.embed_lyrics,
            embed_metadata=req.embed_metadata,
            file_naming=req.file_naming,
            custom_path=req.custom_path,
            retries=req.retries,
            speed_limit=req.speed_limit,
            concurrency=req.concurrency,
            owner=user.get("sub"),
        )
        jobs.append(job)
    return jobs