"""Share API — generate shareable links and OpenGraph metadata for tracks.

When a user shares a track, the recipient gets a rich preview card
with the track title, artist, and artwork. The link deep-links into
the app's search page pre-filled with the track info.
"""

from __future__ import annotations

import html as html_lib
from urllib.parse import urlencode, urlparse

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from app.core.deps import get_current_user

router = APIRouter()

_HOME = "https://rheoson.onrender.com"


def _safe_query(text: str) -> str:
    """Trim to a sane length for share cards."""
    return text.strip()[:300]


def _safe_image(url: str) -> str:
    """Only allow http(s) images; never javascript:/data: URIs."""
    url = (url or "").strip()
    if not url:
        return ""
    parts = urlparse(url)
    if parts.scheme in ("http", "https"):
        return url[:1000]
    return ""


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

    Every interpolated value is HTML-escaped — title/artist come straight
    from the query string and were previously reflected raw (reflected XSS).
    """
    title  = _safe_query(title)
    artist = _safe_query(artist)
    q      = f"{title} {artist}".strip()
    search_url = f"{_HOME}/search?{urlencode({'q': q})}"
    og_title = f"{title} — {artist}" if title and artist else "Rheoson"
    og_desc = f"Listen to {title} by {artist} on Rheoson" if title and artist else "Rheoson — Self-hosted music streaming"
    og_image = _safe_image(artwork) or f"{_HOME}/assets/logo.png"

    # Escape for HTML context (also neutralises quote-based attribute breakout)
    e = html_lib.escape
    # og:image and og:url also need to be safe as attribute values
    attr_image = e(og_image, quote=True)
    attr_url   = e(search_url, quote=True)
    attr_title = e(og_title, quote=True)
    attr_desc  = e(og_desc, quote=True)
    esc_body   = e(f"{title} {artist}".strip() or "Rheoson")

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{e(og_title)}</title>

    <!-- OpenGraph -->
    <meta property="og:type" content="music.song">
    <meta property="og:title" content="{attr_title}">
    <meta property="og:description" content="{attr_desc}">
    <meta property="og:image" content="{attr_image}">
    <meta property="og:url" content="{attr_url}">

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{attr_title}">
    <meta name="twitter:description" content="{attr_desc}">
    <meta name="twitter:image" content="{attr_image}">

    <!-- Redirect to app -->
    <meta http-equiv="refresh" content="0;url={attr_url}">
    <link rel="canonical" href="{attr_url}">
</head>
<body>
    <p>Redirecting to <a href="{attr_url}">{esc_body}</a>...</p>
</body>
</html>"""
    return HTMLResponse(content=html)


@router.get("/{track_id}/link")
async def share_link(
    track_id: str,
    title: str = "",
    artist: str = "",
    _user: dict = Depends(get_current_user),
):
    """Return a clean shareable URL for a track."""
    q = f"{title} {artist}".strip()
    params = urlencode({"q": q}) if q else ""
    url = f"{_HOME}/search?{params}" if params else f"{_HOME}/search"
    return {
        "url": url,
        "deeplink": f"rheoson://search?{params}" if params else "rheoson://search",
    }
