from __future__ import annotations
import re
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.core.deps import get_current_user
from app.schemas.download_schema import DownloadRequestSchema, DownloadJobSchema
from app.services.download_service import (
    enqueue_download, get_all_jobs, get_job,
    cancel_job, retry_job, _persist_jobs,
)

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
        raise HTTPException(status_code=400, detail="Invalid job ID")
    # Jobs are created with uuid4(); reject anything that isn't that shape so
    # malformed IDs get a clear 400 before the 404 lookup.
    if not _UUID_RE.match(job_id):
        raise HTTPException(status_code=400, detail="Invalid job ID format")
    return job_id


@router.post("", response_model=DownloadJobSchema, status_code=202)
@router.post("/", response_model=DownloadJobSchema, status_code=202, include_in_schema=False)
async def start_download(req: DownloadRequestSchema, _user: dict = Depends(get_current_user)):
    if not req.trackId and not req.url:
        raise HTTPException(status_code=400, detail="trackId or url is required")

    # Validate URL format if provided
    if req.url:
        req.url = req.url.strip()
        if len(req.url) > 2048:
            raise HTTPException(status_code=400, detail="URL too long")
        if not re.match(r'^https?://', req.url, re.IGNORECASE):
            raise HTTPException(status_code=400, detail="Invalid URL format")

        # Only known media hosts may be downloaded server-side (SSRF guard).
        from app.services.netguard import ensure_safe_media_url
        try:
            ensure_safe_media_url(req.url)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    # Validate track ID format if provided
    if req.trackId:
        req.trackId = req.trackId.strip()
        if len(req.trackId) > 20:
            raise HTTPException(status_code=400, detail="Invalid track ID")

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
    )
    return job


@router.get("", response_model=list[DownloadJobSchema])
@router.get("/", response_model=list[DownloadJobSchema], include_in_schema=False)
async def list_downloads(_user: dict = Depends(get_current_user)):
    return get_all_jobs()


@router.get("/{job_id}", response_model=DownloadJobSchema)
async def get_download(job_id: str, _user: dict = Depends(get_current_user)):
    job_id = _validate_job_id(job_id)
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
    return job


@router.post("/{job_id}/cancel")
async def cancel_download(job_id: str, _user: dict = Depends(get_current_user)):
    job_id = _validate_job_id(job_id)
    ok = await cancel_job(job_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
    return {"ok": True}


@router.post("/{job_id}/retry", response_model=DownloadJobSchema)
async def retry_download(job_id: str, _user: dict = Depends(get_current_user)):
    job_id = _validate_job_id(job_id)
    job = await retry_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
    return job


@router.delete("/{job_id}")
async def delete_download(job_id: str, _user: dict = Depends(get_current_user)):
    job_id = _validate_job_id(job_id)
    from app.services.download_service import _jobs
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
    del _jobs[job_id]
    _persist_jobs()
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
async def batch_download(req: BatchDownloadRequest, _user: dict = Depends(get_current_user)):
    """Start multiple downloads at once (max 20)."""
    if not req.track_ids:
        raise HTTPException(status_code=400, detail="track_ids cannot be empty")
    if len(req.track_ids) > 20:
        raise HTTPException(status_code=400, detail="Maximum 20 tracks per batch")

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
        )
        jobs.append(job)
    return jobs