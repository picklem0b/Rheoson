from __future__ import annotations
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class SpotifyCredsSchema(BaseModel):
    clientId:     str
    clientSecret: str


@router.post("/spotify")
async def save_spotify_creds(body: SpotifyCredsSchema):
    """
    Write Spotify credentials to .env so they persist across restarts.
    Called by onboarding and Settings → Account.
    """
    if not body.clientId.strip() or not body.clientSecret.strip():
        raise HTTPException(status_code=400, detail="Both clientId and clientSecret are required")

    env_path = Path(__file__).parent.parent.parent / ".env"

    # Read existing .env
    lines: list[str] = []
    if env_path.exists():
        lines = env_path.read_text().splitlines()

    # Update or append each key
    def _set(key: str, value: str):
        for i, line in enumerate(lines):
            if line.startswith(f"{key}="):
                lines[i] = f"{key}={value}"
                return
        lines.append(f"{key}={value}")

    _set("SPOTIFY_CLIENT_ID",     body.clientId.strip())
    _set("SPOTIFY_CLIENT_SECRET", body.clientSecret.strip())

    env_path.write_text("\n".join(lines) + "\n")

    # Hot-reload into running settings
    from app.core.config import settings
    settings.SPOTIFY_CLIENT_ID     = body.clientId.strip()
    settings.SPOTIFY_CLIENT_SECRET = body.clientSecret.strip()

    # Clear Spotify token cache so it re-authenticates
    from app.services import spotify_service
    spotify_service._token_cache.clear()

    return {"ok": True, "message": "Spotify credentials saved and active"}


@router.get("/spotify/status")
async def spotify_status():
    from app.core.config import settings
    return {
        "connected": settings.has_spotify,
        "clientId":  settings.SPOTIFY_CLIENT_ID[:8] + "..." if settings.has_spotify else "",
    }