from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "shulker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.tasks.download_tasks", "app.tasks.metadata_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    result_extended=True,
)
