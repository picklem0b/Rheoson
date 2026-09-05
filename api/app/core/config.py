from __future__ import annotations
import json
import sys
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ENV:      str = "development"
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000

    MUSIC_DIR:     str = "/data/data/com.termux/files/home/Rheoson/music"
    DOWNLOADS_DIR: str = "/data/data/com.termux/files/home/Rheoson/downloads"

    EXTRA_MUSIC_DIRS: list[str] = [
        "/storage/emulated/0/Music",
        "/storage/emulated/0/Download",
        "/sdcard/Music",
    ]

    AUDIO_FORMAT:             str = "mp3"
    AUDIO_QUALITY:            str = "0"
    MAX_CONCURRENT_DOWNLOADS: int = 4

    SPOTIFY_CLIENT_ID:     str = ""
    SPOTIFY_CLIENT_SECRET: str = ""

    # ── MongoDB ────────────────────────────────────────────────
    MONGODB_URL:    str = "mongodb://localhost:27017"
    MONGODB_DB_NAME: str = "rheoson"

    # ── Clerk Authentication ──────────────────────────────────
    CLERK_SECRET_KEY:         str = ""
    CLERK_PUBLISHABLE_KEY:    str = ""
    CLERK_WEBHOOK_SECRET:     str = ""

    # ── Redis (Upstash) ───────────────────────────────────────
    REDIS_URL: str = ""

    # ── Secrets ───────────────────────────────────────────────
    # Used for internal signing (session tokens, CSRF, etc.)
    # MUST be set in production — app refuses to start without it.
    SECRET_KEY: str = "dev-only-insecure-secret-key-do-not-use-in-prod"

    # ── Rate limiting ─────────────────────────────────────────
    RATE_LIMIT_SEARCH:   int = 30   # requests per minute per IP
    RATE_LIMIT_DOWNLOAD: int = 10   # requests per minute per IP

    # ── Instance administration ────────────────────────────────
    # Clerk subs allowed to mutate instance-level configuration (music
    # directories, library rescan). Leave empty for single-admin dev setups.
    ADMIN_SUBS: list[str] = []

    # CORS_ORIGINS is an ADDITIVE override — extra origins beyond the
    # hardcoded builtins in main.py.
    CORS_ORIGINS: list[str] = [
        "https://rheoson-web.onrender.com",
        "https://rheoson-api-vnny.onrender.com",
        "https://rheoson.onrender.com",
    ]

    # ── Render deployment URL (for keep-alive ping) ────────────
    RENDER_API_URL: str = ""

    # ── Computed ──────────────────────────────────────────────

    @property
    def is_prod(self) -> bool:
        return self.ENV == "production"

    @property
    def is_dev(self) -> bool:
        return self.ENV == "development"

    @property
    def has_spotify(self) -> bool:
        return bool(self.SPOTIFY_CLIENT_ID and self.SPOTIFY_CLIENT_SECRET)

    @property
    def has_clerk(self) -> bool:
        return bool(self.CLERK_SECRET_KEY and self.CLERK_PUBLISHABLE_KEY)

    @property
    def has_redis(self) -> bool:
        return bool(self.REDIS_URL)

    @property
    def all_music_dirs(self) -> list[str]:
        """All music dirs that actually exist on disk."""
        dirs = [self.MUSIC_DIR] + list(self.EXTRA_MUSIC_DIRS)
        return [d for d in dict.fromkeys(dirs) if Path(d).exists()]

    @property
    def all_music_dirs_configured(self) -> list[str]:
        """All configured dirs regardless of whether they exist."""
        return list(dict.fromkeys([self.MUSIC_DIR] + list(self.EXTRA_MUSIC_DIRS)))


settings = Settings()

# ── Startup validation ────────────────────────────────────────

def validate_startup() -> None:
    """Validate critical config at startup. Exit in production if misconfigured."""
    errors: list[str] = []

    if settings.is_prod:
        if settings.SECRET_KEY == "dev-only-insecure-secret-key-do-not-use-in-prod":
            errors.append("SECRET_KEY must be set to a secure value in production")
        if not settings.CLERK_SECRET_KEY:
            errors.append("CLERK_SECRET_KEY is required in production")
        if not settings.CLERK_PUBLISHABLE_KEY:
            errors.append("CLERK_PUBLISHABLE_KEY is required in production")

    if errors:
        msg = "FATAL: Configuration errors:\n" + "\n".join(f"  - {e}" for e in errors)
        if settings.is_prod:
            print(msg, file=sys.stderr)
            sys.exit(1)
        else:
            import warnings
            warnings.warn(msg, stacklevel=1)
