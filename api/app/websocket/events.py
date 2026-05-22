from enum import StrEnum


class WSEvent(StrEnum):
    DOWNLOAD_PROGRESS = "download:progress"
    DOWNLOAD_COMPLETE = "download:complete"
    DOWNLOAD_ERROR    = "download:error"
    LIBRARY_UPDATED   = "library:updated"
    QUEUE_UPDATED     = "queue:updated"
