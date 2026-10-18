/**
 * Artwork URLs.
 *
 * Album art comes from third-party CDNs (YouTube Music, Spotify) that do not
 * answer a native client's request without an Origin a browser would send, and
 * some of them refuse hotlinking outright. Routing them through the API keeps
 * one code path for every image and lets the server cache them.
 */
import { mediaUrl } from '@/api/client';
import { API_BASE } from '@/constants/config';

/** Absolute artwork URL: same-origin stream art passes through, remote proxies. */
export function artworkUrl(url: string | undefined | null): string | undefined {
	if (!url) return undefined;
	if (url.startsWith('http://') || url.startsWith('https://')) {
		// Remote CDNs go through the proxy; our own API host does not need to.
		if (url.includes('/api/')) return url;
		return `${API_BASE}/stream/artwork-proxy?url=${encodeURIComponent(url)}`;
	}
	if (url.startsWith('/')) return mediaUrl(url);
	return undefined;
}
