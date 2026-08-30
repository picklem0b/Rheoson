from __future__ import annotations
import json
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ENV:      str = "development"
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000

    MUSIC_DIR:     str = "/data/data/com.termux/files/home/Rheoson/music"
    DOWNLOADS_DIR: str = "/data/data/com.termux/files/home/Rheoson/downloads"

    # Comma-separated or JSON array of extra directories.
    # On Render: EXTRA_MUSIC_DIRS=/tmp/Rheoson/music
    # On Termux: leave unset — defaults cover the common paths
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

    # CORS_ORIGINS is an ADDITIVE override — extra origins beyond the
    # hardcoded builtins in main.py. Set on Render as:
    #   CORS_ORIGINS=https://my-custom-domain.com
    # or as a JSON array:
    #   CORS_ORIGINS=["https://a.com","https://b.com"]
    # Leave unset to rely solely on the builtins (recommended).
    CORS_ORIGINS: list[str] = [
        "https://rheoson-web.onrender.com",
        "https://rheoson-api-vnny.onrender.com",
        "https://rheoson.onrender.com",
    ]

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
    def all_music_dirs(self) -> list[str]:
        """All music dirs that actually exist on disk."""
        dirs = [self.MUSIC_DIR] + list(self.EXTRA_MUSIC_DIRS)
        return [d for d in dict.fromkeys(dirs) if Path(d).exists()]

    @property
    def all_music_dirs_configured(self) -> list[str]:
        """All configured dirs regardless of whether they exist."""
        return list(dict.fromkeys([self.MUSIC_DIR] + list(self.EXTRA_MUSIC_DIRS)))


settings = Settings()