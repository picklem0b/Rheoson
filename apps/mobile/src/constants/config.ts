/**
 * Where this build's API lives.
 *
 * Baked in at bundle time (`EXPO_PUBLIC_API_URL`), with the project's own
 * backend as the fallback. The fallback is deliberately a *real* origin and
 * never a relative path: a phone has no bundle host to serve `/api`, so a
 * relative base would answer every request with whatever the fetch layer
 * happens to do with it — the exact failure that once shipped a build whose
 * API calls all came back as HTML.
 */

/** The project's Render backend — the default for a build with no env set. */
export const CANONICAL_API_ORIGIN = 'https://rheoson-api-9e4c.onrender.com';

function resolveApiOrigin(): string {
	const configured = (process.env.EXPO_PUBLIC_API_URL ?? '')
		.trim()
		.replace(/\/+$/, '');
	if (/^https?:\/\//i.test(configured)) return configured;
	return CANONICAL_API_ORIGIN;
}

/** Origin only, no `/api` suffix — Socket.IO connects here. */
export const API_ORIGIN = resolveApiOrigin();

/** Base for every REST route. */
export const API_BASE = `${API_ORIGIN}/api`;

/** Whether this build points at the public backend or a local one. */
export const IS_LOCAL_BACKEND = /^http:\/\//i.test(API_ORIGIN);

/** Version shown in Settings → About, and compared against the server's. */
export const APP_VERSION = '2.26.0';
