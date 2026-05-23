from __future__ import annotations
from fastapi import APIRouter, HTTPException
from app.schemas.download import DownloadRequestSchema, DownloadJobSchema
from app.services.download_service import (
    enqueue_download, get_all_jobs, get_job,
    cancel_job, retry_job,
)

router = APIRouter()


@router.post("/", response_model=DownloadJobSchema, status_code=202)
async def start_download(req: DownloadRequestSchema):
    if not req.trackId and not req.url:
        raise HTTPException(status_code=400, detail="trackId or url is required")

    job = await enqueue_download(
        track_id=req.trackId,
        url=req.url,
        fmt=req.format,
        quality=req.quality,
        embed_artwork=req.embedArtwork,
        embed_lyrics=req.embedLyrics,
    )
    return job


@router.get("/", response_model=list[DownloadJobSchema])
async def list_downloads():
    return get_all_jobs()


@router.get("/{job_id}", response_model=DownloadJobSchema)
async def get_download(job_id: str):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
    return job


@router.post("/{job_id}/cancel")
async def cancel_download(job_id: str):
    ok = await cancel_job(job_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
    return {"ok": True}


@router.post("/{job_id}/retry", response_model=DownloadJobSchema)
async def retry_download(job_id: str):
    job = await retry_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
    return job


@router.delete("/{job_id}")
async def delete_download(job_id: str):
    from app.services.download_service import _jobs
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
    del _jobs[job_id]
    return {"ok": True}