import uuid
from app.schemas.download import DownloadJob, DownloadRequest
from app.tasks.download_tasks import download_track


def enqueue_download(req: DownloadRequest) -> DownloadJob:
    job_id = str(uuid.uuid4())

    download_track.apply_async(
        kwargs={
            "job_id":        job_id,
            "url":           req.url,
            "fmt":           req.format,
            "playlist_name": req.playlist_name,
        },
        task_id=job_id,
    )

    return DownloadJob(
        job_id=job_id,
        url=req.url,
        format=req.format,
        status="queued",
    )


def get_download_status(job_id: str) -> DownloadJob:
    from app.tasks import celery_app

    result = celery_app.AsyncResult(job_id)

    status_map = {
        "PENDING": "queued",
        "STARTED": "downloading",
        "SUCCESS": "complete",
        "FAILURE": "failed",
        "RETRY":   "queued",
        "REVOKED": "failed",
    }

    meta = result.info if isinstance(result.info, dict) else {}

    return DownloadJob(
        job_id=job_id,
        url="",
        format="mp3",
        status=status_map.get(result.state, result.state.lower()),
        progress=meta.get("progress", 0.0),
        title=meta.get("title"),
        error=str(result.result) if result.state == "FAILURE" else None,
    )