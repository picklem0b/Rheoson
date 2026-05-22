from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ENV:                     str      = "development"
    API_HOST:                str      = "0.0.0.0"
    API_PORT:                int      = 8000
    REDIS_URL:               str      = "redis://127.0.0.1:6379/0"
    MUSIC_DIR:               str      = "/data/data/com.termux/files/home/shulker/music"
    DOWNLOADS_DIR:           str      = "/data/data/com.termux/files/home/shulker/downloads"
    AUDIO_FORMAT:            str      = "mp3"
    AUDIO_QUALITY:           str      = "0"
    MAX_CONCURRENT_DOWNLOADS:int      = 4
    SPOTIFY_CLIENT_ID:       str      = ""
    SPOTIFY_CLIENT_SECRET:   str      = ""
    CORS_ORIGINS:            list[str] = ["http://localhost:5173", "http://localhost:3000"]


settings = Settings()