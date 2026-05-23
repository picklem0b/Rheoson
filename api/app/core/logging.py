import logging
import structlog
from app.core.config import settings


def configure_logging() -> None:
    level = logging.DEBUG if settings.is_dev else logging.INFO

    logging.basicConfig(
        format="%(message)s",
        level=level,
    )

    # Silence noisy libs
    for noisy in ("httpx", "httpcore", "urllib3", "asyncio"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    shared_processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
    ]

    if settings.is_dev:
        # Pretty coloured output in dev
        processors = shared_processors + [
            structlog.dev.ConsoleRenderer(colors=True),
        ]
    else:
        # JSON in prod
        processors = shared_processors + [
            structlog.processors.dict_tracebacks,
            structlog.processors.JSONRenderer(),
        ]

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )