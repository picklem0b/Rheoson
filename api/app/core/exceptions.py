from fastapi import HTTPException, status


class TrackNotFound(HTTPException):
    def __init__(self, track_id: str):
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=f"Track {track_id!r} not found")


class DownloadFailed(HTTPException):
    def __init__(self, reason: str):
        super().__init__(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Download failed: {reason}")


class UnsupportedFormat(HTTPException):
    def __init__(self, fmt: str):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported format: {fmt!r}")
