import re
from fastapi import APIRouter
from app.schemas.download import DownloadJob, DownloadRequest
from app.services.download_service import enqueue_download, get_download_status

router = APIRouter()

SPOTIFY_TRACK    = re.compile(r'open\.spotify\.com/track/')
SPOTIFY_PLAYLIST = re.compile(r'open\.spotify\.com/playlist/')
SPOTIFY_ALBUM    = re.compile(r'open\.spotify\.com/album/')


def _resolve_url(req: DownloadRequest) -> DownloadRequest:
    """
    yt-dlp cannot touch Spotify URLs (DRM).
    - Plain text query  → prefix with ytsearch1:
    - Spotify track URL → extract track ID, search YouTube Music
    - Spotify playlist  → reject with helpful message (must use search per track)
    - Any other URL     → pass through as-is (YouTube, SoundCloud, etc.)
    """
    url = req.url.strip()

    # plain search query
    if not url.startswith("http"):
        req.url = f"ytsearch1:{url}"
        return req

    # spotify playlist / album — we can't batch these yet, tell the user
    if SPOTIFY_PLAYLIST.search(url) or SPOTIFY_ALBUM.search(url):
        raise ValueError(
            "Spotify playlist/album URLs are not supported directly. "
            "Copy individual track URLs or search by song name instead."
        )

    # spotify track — pull title+artist from Spotify API then search YouTube
    if SPOTIFY_TRACK.search(url):
        query = _spotify_track_to_query(url)
        req.url = f"ytsearch1:{query}"
        return req

    # youtube or any other direct URL — pass through
    return req


def _spotify_track_to_query(spotify_url: str) -> str:
    """
    Use the Spotify API (if creds are set) to get title + artist.
    Falls back to extracting the track ID and doing a bare search.
    """
    import os
    import httpx

    client_id     = os.environ.get("SPOTIFY_CLIENT_ID", "")
    client_secret = os.environ.get("SPOTIFY_CLIENT_SECRET", "")

    # extract track ID from URL
    match = re.search(r'/track/([A-Za-z0-9]+)', spotify_url)
    track_id = match.group(1) if match else ""

    if client_id and client_secret and track_id:
        try:
            # get access token
            token_resp = httpx.post(
                "https://accounts.spotify.com/api/token",
                data={"grant_type": "client_credentials"},
                auth=(client_id, client_secret),
                timeout=8,
            )
            token = token_resp.json().get("access_token", "")

            if token:
                track_resp = httpx.get(
                    f"https://api.spotify.com/v1/tracks/{track_id}",
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=8,
                )
                data    = track_resp.json()
                title   = data.get("name", "")
                artists = ", ".join(a["name"] for a in data.get("artists", []))
                if title and artists:
                    return f"{title} {artists}"
        except Exception:
            pass

    # fallback — just use the track ID as search term, better than nothing
    return track_id or "unknown track"


@router.post("/", response_model=DownloadJob, status_code=202)
async def start_download(req: DownloadRequest):
    from fastapi import HTTPException
    try:
        req = _resolve_url(req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return enqueue_download(req)


@router.get("/{job_id}", response_model=DownloadJob)
async def download_status(job_id: str):
    return get_download_status(job_id)