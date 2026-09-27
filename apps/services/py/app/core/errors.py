"""The engine's one failure shape, carrying its DCCNN chip.

Every layer below the HTTP surface raises this instead of returning ``None``
once the answer is definitively "no": the route layer turns it into the wire
format, and nothing invents copy the registry does not own.
"""

from __future__ import annotations

from app.core import error_codes


class EngineError(Exception):
    """A failure that maps to exactly one registered DCCNN code."""

    def __init__(self, code: str, status: int = 400, detail: str | None = None) -> None:
        super().__init__(error_codes.wire(code, detail))
        self.code = code
        self.status = status
        self.detail = detail

    @property
    def message(self) -> str:
        return error_codes.wire(self.code, self.detail)
