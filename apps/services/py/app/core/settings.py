"""Engine configuration, read from the environment.

Deliberately a plain dataclass rather than a settings framework: the engine
has fewer knobs than the API and every one of them is a deployment value the
compose file already states.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


def _env_str(key: str, fallback: str = "") -> str:
    return os.environ.get(key, "").strip() or fallback


def _env_float(key: str, fallback: float) -> float:
    raw = os.environ.get(key, "").strip()
    if not raw:
        return fallback
    try:
        value = float(raw)
    except ValueError:
        return fallback
    return value if value > 0 else fallback


def _env_int(key: str, fallback: int) -> int:
    raw = os.environ.get(key, "").strip()
    if not raw:
        return fallback
    try:
        value = int(raw)
    except ValueError:
        return fallback
    return value if value > 0 else fallback


@dataclass(frozen=True)
class Settings:
    """Resolved engine configuration."""

    port: int
    #: Shared service token. Empty means the engine trusts its network — the
    #: compose-internal posture; set it in any wider deployment.
    token: str
    #: Where downloads, staging and tagging work happen.
    data_dir: str
    #: Bounds one `yt-dlp -g` extraction before the fast path is abandoned.
    resolve_timeout: float
    #: Resolved CDN URLs are signed for hours; refresh well inside that window.
    direct_url_ttl: float
    #: Comma-separated player-client ladder, overriding the built-in order.
    client_ladder: str

    @property
    def ladder(self) -> list[str]:
        parts = [p.strip() for p in self.client_ladder.split(",") if p.strip()]
        return parts


def load() -> Settings:
    return Settings(
        port=_env_int("ENGINE_PORT", 8081),
        token=_env_str("ENGINE_TOKEN"),
        data_dir=_env_str("ENGINE_DATA_DIR", "/data"),
        resolve_timeout=_env_float("ENGINE_RESOLVE_TIMEOUT", 25.0),
        direct_url_ttl=_env_float("ENGINE_DIRECT_URL_TTL", 4 * 60 * 60),
        client_ladder=_env_str("ENGINE_CLIENT_LADDER"),
    )
