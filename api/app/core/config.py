from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ENV:       str = "development"
    API_HOST:  str = "0.0.0.0"
    API_PORT:  int = 8000

    MUSIC_DIR:      str = "/data/data/com.termux/files/home/shulker/music"
    DOWNLOADS_DIR:  str = "/data/data/com.termux/files/home/shulker/downloads"

    EXTRA_MUSIC_DIRS: list[str] = [
        "/storage/emulated/0/Music",
        "/storage/emulated/0/Download",
        "/sdcard/Music",
    ]

    REDIS_URL:                str = "redis://127.0.0.1:6379/0"
    AUDIO_FORMAT:             str = "mp3"
    AUDIO_QUALITY:            str = "0"
    MAX_CONCURRENT_DOWNLOADS: int = 4

    SPOTIFY_CLIENT_ID:     str = ""
    SPOTIFY_CLIENT_SECRET: str = ""

    # Allow all origins — locked down per-env via CORS_ORIGINS env var on Render
    CORS_ORIGINS: list[str] = ["*"]

    @property
    def is_dev(self) -> bool:
        return self.ENV == "development"

    @property
    def has_spotify(self) -> bool:
        return bool(self.SPOTIFY_CLIENT_ID and self.SPOTIFY_CLIENT_SECRET)

    @property
    def all_music_dirs(self) -> list[str]:
        dirs = [self.MUSIC_DIR] + self.EXTRA_MUSIC_DIRS
        return [d for d in dirs if __import__("pathlib").Path(d).exists()]


settings = Settings()