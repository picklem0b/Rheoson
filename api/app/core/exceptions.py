import structlog
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from app.core.logging_config import arm_traceback_suppression as arm_duplicate_suppression

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


async def http_exception_handler(request: Request, exc: "HTTPException"):
    """Emit the error-code envelope on every HTTPException-shaped failure.

    Exceptions built by ``error_codes.fail()`` carry their registry code in
    the detail (``… [ERROR_CODE: DEX01]``) and on ``exc.error_code``; those
    become the structured ``code`` field. Any other HTTPException keeps its
    detail and gets no code — the frontend falls back to the status code.
    Registered in app.main so plain ``raise HTTPException(...)`` still
    produces one consistent response shape.
    """
    code = getattr(exc, "error_code", None)
    detail = exc.detail if isinstance(exc.detail, str) else "Request failed"
    content: dict = {"detail": detail}
    if code is not None:
        content["code"] = code
    headers = getattr(exc, "headers", None)
    return JSONResponse(status_code=exc.status_code, content=content, headers=headers)


async def generic_exception_handler(request: Request, exc: Exception):
    # The response body is deliberately generic; the log line carries the
    # real exception so production incidents stay diagnosable without
    # leaking internals to the client. The ASGI layer's duplicate traceback
    # is suppressed for a short window (armed here, honored by the
    # DuplicateTracebackFilter on uvicorn.error) so an incident is logged
    # once, structured, with its request id.
    log.error(
        "api.unhandled_exception",
        method=request.method,
        path=request.url.path,
        error=str(exc),
        exc_info=True,
    )
    arm_duplicate_suppression()
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "type": "UnexpectedError"},
    )