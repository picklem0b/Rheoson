import httpx
from app.core.config import settings

LRCLIB_BASE = "https://lrclib.net/api"


async def fetch_lyrics(title: str, artist: str, album: str = "", duration: int = 0) -> dict | None:
    params = {"track_name": title, "artist_name": artist}
    if album:
        params["album_name"] = album
    if duration:
        params["duration"] = duration

    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{LRCLIB_BASE}/get", params=params, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            return {
                "plain": data.get("plainLyrics"),
                "synced": data.get("syncedLyrics"),
            }
    return None
