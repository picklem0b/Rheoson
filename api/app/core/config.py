from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )

    # ── Server ────────────────────────────────────────────────
    ENV:       str = "development"
    API_HOST:  str = "0.0.0.0"
    API_PORT:  int = 8000

    # ── Paths ─────────────────────────────────────────────────
    MUSIC_DIR:     str = "/data/data/com.termux/files/home/shulker/music"
    DOWNLOADS_DIR: str = "/data/data/com.termux/files/home/shulker/downloads"

    # ── Redis ─────────────────────────────────────────────────
    REDIS_URL: str = "redis://127.0.0.1:6379/0"

    # ── Audio defaults ────────────────────────────────────────
    AUDIO_FORMAT:             str = "mp3"
    AUDIO_QUALITY:            str = "0"        # yt-dlp quality — 0 = best
    MAX_CONCURRENT_DOWNLOADS: int = 4

    # ── Spotify ───────────────────────────────────────────────
    # Used only for metadata + URL resolution — never for downloading
    SPOTIFY_CLIENT_ID:     str = ""
    SPOTIFY_CLIENT_SECRET: str = ""

    # ── CORS ──────────────────────────────────────────────────
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ]

    # ── Derived ───────────────────────────────────────────────
    @property
    def is_dev(self) -> bool:
        return self.ENV == "development"

    @property
    def has_spotify(self) -> bool:
        return bool(self.SPOTIFY_CLIENT_ID and self.SPOTIFY_CLIENT_SECRET)


settings = Settings()