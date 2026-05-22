from app.tasks import celery_app


@celery_app.task(name="tasks.enrich_metadata")
def enrich_metadata(track_id: str):
    pass
