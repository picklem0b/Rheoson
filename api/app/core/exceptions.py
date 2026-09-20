import structlog
from fastapi import Request
from fastapi.responses import JSONResponse

log = structlog.get_logger()


class RheosonException(Exception):
    """Base exception for all Rheoson errors."""
    def __init__(self, message: str, code: int = 500):
        self.message = message
        self.code    = code
        super().__init__(message)


class NotFoundError(RheosonException):
    def __init__(self, resource: str, id: str = ""):
        super().__init__(
            message=f"{resource} not found" + (f": {id}" if id else ""),
            code=404,
        )


class DownloadError(RheosonException):
    def __init__(self, message: str):
        super().__init__(message=message, code=422)


class StreamError(RheosonException):
    def __init__(self, message: str):
        super().__init__(message=message, code=500)


class SearchError(RheosonException):
    def __init__(self, message: str):
        super().__init__(message=message, code=502)


class SpotifyError(RheosonException):
    def __init__(self, message: str):
        super().__init__(message=message, code=502)


class UnsupportedURLError(RheosonException):
    def __init__(self, url: str):
        super().__init__(
            message=f"Unsupported or unresolvable URL: {url}",
            code=400,
        )


# ── FastAPI exception handlers ────────────────────────────────
async def Rheoson_exception_handler(request: Request, exc: RheosonException):
    return JSONResponse(
        status_code=exc.code,
        content={"detail": exc.message, "type": type(exc).__name__},
    )


async def generic_exception_handler(request: Request, exc: Exception):
    # The response body is deliberately generic; the log line carries the
    # real exception so production incidents stay diagnosable without
    # leaking internals to the client.
    log.error(
        "api.unhandled_exception",
        method=request.method,
        path=request.url.path,
        error=str(exc),
        exc_info=True,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "type": "UnexpectedError"},
    )