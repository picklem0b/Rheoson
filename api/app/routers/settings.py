import os
from pathlib import Path
from fastapi import APIRouter
from pydantic import BaseModel
from app.core.config import settings

router = APIRouter()


class CredentialsBody(BaseModel):
    client_id: str
    client_secret: str


class AppSettings(BaseModel):
    music_dir: str
    downloads_dir: str
    audio_format: str
    bitrate: str
    max_concurrent: int


@router.get("/", response_model=AppSettings)
async def get_settings():
    return AppSettings(
        music_dir=settings.MUSIC_DIR,
        downloads_dir=settings.DOWNLOADS_DIR,
        audio_format=settings.SPOTDL_AUDIO_FORMAT,
        bitrate=settings.SPOTDL_BITRATE,
        max_concurrent=settings.SPOTDL_MAX_CONCURRENT,
    )


@router.post("/credentials")
async def save_credentials(body: CredentialsBody):
    env_path = Path(__file__).parent.parent.parent / ".env"

    lines = []
    if env_path.exists():
        lines = env_path.read_text().splitlines()

    keys_to_set = {
        "SPOTIFY_CLIENT_ID": body.client_id,
        "SPOTIFY_CLIENT_SECRET": body.client_secret,
    }

    updated: set[str] = set()
    new_lines: list[str] = []

    for line in lines:
        if "=" in line and not line.startswith("#"):
            key = line.split("=")[0].strip()
            if key in keys_to_set:
                new_lines.append(f"{key}={keys_to_set[key]}")
                updated.add(key)
            else:
                new_lines.append(line)
        else:
            new_lines.append(line)

    for key, val in keys_to_set.items():
        if key not in updated:
            new_lines.append(f"{key}={val}")

    env_path.write_text("\n".join(new_lines) + "\n")

    os.environ["SPOTIFY_CLIENT_ID"] = body.client_id
    os.environ["SPOTIFY_CLIENT_SECRET"] = body.client_secret

    return {"status": "saved"}