from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse


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
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "type": "UnexpectedError"},
    )