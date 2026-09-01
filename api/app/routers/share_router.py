"""Share API — generate shareable links and OpenGraph metadata for tracks.

When a user shares a track, the recipient gets a rich preview card
with the track title, artist, and artwork. The link deep-links into
the app's search page pre-filled with the track info.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse

router = APIRouter()


@router.get("/{track_id}/card")
async def share_card(
    track_id: str,
    title: str = Query(""),
    artist: str = Query(""),
    artwork: str = Query(""),
):
    """Return an OpenGraph HTML page for social media sharing previews.

    The meta tags are read by Telegram, Discord, Twitter, WhatsApp, etc.
    to generate rich preview cards when the link is pasted.
    """
    search_url = f"https://rheoson.onrender.com/search?q={title} {artist}"
    og_title = f"{title} — {artist}" if title and artist else "Rheoson"
    og_desc = f"Listen to {title} by {artist} on Rheoson" if title and artist else "Rheoson — Self-hosted music streaming"
    og_image = artwork or "https://rheoson.onrender.com/assets/logo.png"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{og_title}</title>

    <!-- OpenGraph -->
    <meta property="og:type" content="music.song">
    <meta property="og:title" content="{og_title}">
    <meta property="og:description" content="{og_desc}">
    <meta property="og:image" content="{og_image}">
    <meta property="og:url" content="{search_url}">

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{og_title}">
    <meta name="twitter:description" content="{og_desc}">
    <meta name="twitter:image" content="{og_image}">

    <!-- Redirect to app -->
    <meta http-equiv="refresh" content="0;url={search_url}">
    <link rel="canonical" href="{search_url}">
</head>
<body>
    <p>Redirecting to <a href="{search_url}">{og_title}</a>...</p>
</body>
</html>"""
    return HTMLResponse(content=html)


@router.get("/{track_id}/link")
async def share_link(track_id: str, title: str = "", artist: str = ""):
    """Return a clean shareable URL for a track."""
    q = f"{title} {artist}".strip()
    return {
        "url": f"https://rheoson.onrender.com/search?q={q}",
        "deeplink": f"rheoson://search?q={q}",
    }
