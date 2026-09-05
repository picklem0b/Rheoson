"""Guard rail for URLs that the server will fetch on a user's behalf.

yt-dlp (used by /search/resolve and downloads) can download from many hosts,
which makes it a classic SSRF surface: an unauthenticated or authenticated
caller could point it at internal addresses, cloud metadata endpoints, or
local services. This module restricts what may be handed to the downloader:

  1. scheme must be http or https
  2. the host must be on the allowlist of known media platforms
  3. the hostname must resolve only to public addresses (no loopback,
     link-local, private ranges, or cloud metadata IPs)
  4. neither the userinfo part nor an exotic port may be used to smuggle a
     request somewhere unexpected

Redirects followed by yt-dlp are not re-checked mid-flight; the allowlist +
public-IP check above closes the arbitrary-host vector, and the remaining
redirect risk is bounded to the allowed platforms' own domains.
"""

from __future__ import annotations

import ipaddress
import re
import socket
from urllib.parse import urlparse

# Hosts the app legitimately downloads music/video from (exact host or any
# subdomain of the domain). YouTube/Spotify are core; the long tail covers
# the platforms yt-dlp is used for elsewhere in the product.
_ALLOWED_DOMAINS = {
    "youtube.com",
    "youtu.be",
    "youtube-nocookie.com",
    "googlevideo.com",     # YouTube media redirects/CDN
    "ytimg.com",           # thumbnails resolved by some extractors
    "spotify.com",
    "scdn.co",             # Spotify CDN
    "soundcloud.com",
    "sndcdn.com",
    "bandcamp.com",
    "bcbits.com",
    "deezer.com",
    "deezer.page.link",
    "tidal.com",
    "music.apple.com",
    "itunes.apple.com",
    "mzstatic.com",        # Apple CDN
    "vimeo.com",
    "player.vimeo.com",
    "twitch.tv",
    "jtvnw.net",
    "mixcloud.com",
    "audiomack.com",
    "reverbnation.com",
    "apple.com",
}

_PRIVATE_NETS = (
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("100.64.0.0/10"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.0.0.0/24"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("198.18.0.0/15"),
    ipaddress.ip_network("224.0.0.0/4"),
    ipaddress.ip_network("240.0.0.0/4"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
    ipaddress.ip_network("ff00::/8"),
    ipaddress.ip_network("::/128"),
)

# Reject weird schemes/forms early (e.g. http://user@host, filesystem paths)
_SCHEME_RE = re.compile(r"^https?$", re.IGNORECASE)
_MAX_URL_LEN = 2048
_MAX_PORT = 65535


def _host_matches_allowlist(host: str) -> bool:
    host = (host or "").lower().rstrip(".")
    if not host:
        return False
    if host in _ALLOWED_DOMAINS:
        return True
    return any(host.endswith("." + d) for d in _ALLOWED_DOMAINS)


def _is_public_ip(addr: ipaddress._BaseAddress) -> bool:
    return not any(addr in net for net in _PRIVATE_NETS)


def ensure_safe_media_url(url: str) -> str:
    """Validate that `url` is safe to hand to yt-dlp/httpx. Returns the URL.

    Raises ValueError with a human-readable reason otherwise.
    """
    if not url or len(url) > _MAX_URL_LEN:
        raise ValueError("URL missing or too long")

    try:
        parts = urlparse(url)
    except Exception:
        raise ValueError("Malformed URL")

    if parts.scheme not in ("http", "https"):
        raise ValueError("Only http(s) URLs are supported")

    if parts.username or parts.password:
        raise ValueError("URLs with embedded credentials are not supported")

    if parts.port is not None and not (0 < parts.port <= _MAX_PORT):
        raise ValueError("Invalid URL port")

    host = parts.hostname
    if not host:
        raise ValueError("URL has no host")

    if not _host_matches_allowlist(host):
        raise ValueError("Host not supported for server-side fetching")

    # Resolve the hostname and require every address to be public. This
    # catches entries that point at loopback/private/metadata IPs while the
    # hostname itself looks like a media site.
    try:
        infos = socket.getaddrinfo(host, None, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        raise ValueError("Host could not be resolved")
    except OSError:
        raise ValueError("Host could not be resolved")

    seen: set[str] = set()
    for info in infos:
        addr = ipaddress.ip_address(info[4][0])
        seen.add(str(addr))
        if not _is_public_ip(addr):
            raise ValueError(f"Host resolves to a non-public address ({addr})")

    return url
