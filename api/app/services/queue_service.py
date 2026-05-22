import json
import redis
from app.core.config import settings

_redis = redis.from_url(settings.REDIS_URL, decode_responses=True)
QUEUE_KEY = "shulker:queue"


def get_queue() -> list[str]:
    return _redis.lrange(QUEUE_KEY, 0, -1)


def push_to_queue(track_id: str) -> None:
    _redis.rpush(QUEUE_KEY, track_id)


def clear_queue() -> None:
    _redis.delete(QUEUE_KEY)


def remove_from_queue(index: int) -> None:
    placeholder = "__remove__"
    _redis.lset(QUEUE_KEY, index, placeholder)
    _redis.lrem(QUEUE_KEY, 1, placeholder)
