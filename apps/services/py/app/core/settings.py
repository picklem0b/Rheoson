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
    #: How other services reach this engine. It appears in resolved local URLs
    #: (the relay fetches them), so it must be the address the compose network
    #: knows this container by, not `localhost`.
    public_url: str
    #: Shared service token. Empty means the engine trusts its network — the
    #: compose-internal posture; set it in any wider deployment.
    token: str
    #: Where downloads, staging, tagging and the library live.
    data_dir: str
    #: Bounds one `yt-dlp -g` extraction before the fast path is abandoned.
    resolve_timeout: float
    #: Resolved CDN URLs are signed for hours; refresh well inside that window.
    direct_url_ttl: float
    #: Comma-separated player-client ladder, overriding the built-in order.
    client_ladder: str
    #: How long a library listing is reused. Short enough that a new download
    #: shows up promptly, long enough that a page of requests costs one walk.
    library_ttl: float
    #: Bounds one remote search extraction.
    search_timeout: float
    #: How many downloads run at once. More than a few saturates an uplink and
    #: makes every ETA wrong.
    download_concurrency: int
    #: Ceiling on queued + running jobs, refused with DLM01 beyond it.
    download_queue_max: int
    #: Bounds a single download before it is killed and reported.
    download_timeout: float
    #: Container yt-dlp's audio conversion produces.
    audio_format: str
    #: Longest acceptable source URL.
    max_url_len: int
    #: Where download progress is POSTed (the server's internal events route).
    #: Empty disables live progress; the job still runs and still completes.
    events_url: str

    @property
    def ladder(self) -> list[str]:
        parts = [p.strip() for p in self.client_ladder.split(",") if p.strip()]
        return parts


def load() -> Settings:
    port = _env_int("ENGINE_PORT", 8081)
    return Settings(
        port=port,
        public_url=_env_str("ENGINE_PUBLIC_URL", f"http://localhost:{port}"),
        token=_env_str("ENGINE_TOKEN"),
        data_dir=_env_str("ENGINE_DATA_DIR", "/data"),
        resolve_timeout=_env_float("ENGINE_RESOLVE_TIMEOUT", 25.0),
        direct_url_ttl=_env_float("ENGINE_DIRECT_URL_TTL", 4 * 60 * 60),
        client_ladder=_env_str("ENGINE_CLIENT_LADDER"),
        library_ttl=_env_float("ENGINE_LIBRARY_TTL", 20.0),
        search_timeout=_env_float("ENGINE_SEARCH_TIMEOUT", 20.0),
        download_concurrency=_env_int("ENGINE_DOWNLOAD_CONCURRENCY", 3),
        download_queue_max=_env_int("ENGINE_DOWNLOAD_QUEUE_MAX", 25),
        download_timeout=_env_float("ENGINE_DOWNLOAD_TIMEOUT", 900.0),
        audio_format=_env_str("ENGINE_AUDIO_FORMAT", "m4a"),
        max_url_len=_env_int("ENGINE_MAX_URL_LEN", 2048),
        events_url=_env_str("ENGINE_EVENTS_URL"),
    )
