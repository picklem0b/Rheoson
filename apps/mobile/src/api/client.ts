/**
 * The one way this app talks to the API.
 *
 * Everything above it (React Query, screens, the player) calls `api.*` and
 * gets either data or an `ApiError` carrying the backend's own status and
 * DCCNN code. The client owns three things so no caller has to:
 *
 *  * **auth** — a guest session is minted once per install and cached in the
 *    keychain; every request carries it. There is no sign-in wall.
 *  * **retry** — a phone loses signal constantly, so a dropped connection is
 *    retried twice with a short backoff before becoming an error. A 401 is
 *    retried once after re-minting the guest session, which is what makes a
 *    wiped server or an expired token self-heal instead of stranding the app.
 *  * **honest failures** — the message says what actually happened. "Backend
 *    returned HTML instead of JSON" is a configuration bug and says so; a
 *    timeout says the server may be waking up.
 */

import { API_BASE } from '@/constants/config';
import {
	ensureSession,
	getSession,
	mintGuestSession
} from '@/services/session';

export interface ApiError extends Error {
	status: number;
	detail: string;
	/** Backend DCCNN code (e.g. "DEX01") when the response carried one. */
	code?: string;
}

export interface RequestOptions extends Omit<RequestInit, 'signal'> {
	params?: Record<string, string | number | boolean | undefined>;
	signal?: AbortSignal;
	/** Internal: retry bookkeeping. */
	_retry?: number;
	/** Internal: set on the retry that re-mints the guest session. */
	_refreshedSession?: boolean;
}

const BODY_FREE = new Set(['GET', 'HEAD', 'DELETE']);

function makeError(status: number, detail: string, code?: string): ApiError {
	const err = new Error(detail) as ApiError;
	err.status = status;
	err.detail = detail;
	if (code) err.code = code;
	return err;
}

/**
 * Split a detail that carries the backend's DCCNN suffix
 * ("Download failed [ERROR_CODE: DEX01]") into message and code. Older
 * renderings are accepted too, so a response in flight across an upgrade still
 * parses.
 */
export function splitErrorCode(detail: string): {
	message: string;
	code?: string;
} {
	const match =
		/\s*\[ERROR_CODE: ([A-Z]{3}\d{2})\]\s*$/.exec(detail ?? '') ??
		/\s*\[ERR:? ([A-Z]{3}\d{2})\]\s*$/.exec(detail ?? '');
	if (!match) return { message: detail };
	return { message: detail.slice(0, match.index).trimEnd(), code: match[1] };
}

function buildUrl(endpoint: string, params?: RequestOptions['params']): string {
	const url = `${API_BASE}${endpoint}`;
	if (!params) return url;
	const query = Object.entries(params)
		.filter(([, value]) => value !== undefined && value !== null)
		.map(
			([key, value]) =>
				`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
		)
		.join('&');
	return query ? `${url}?${query}` : url;
}

async function request<T>(
	endpoint: string,
	options: RequestOptions = {}
): Promise<T> {
	const {
		params,
		_retry = 0,
		_refreshedSession = false,
		headers: rawHeaders,
		...init
	} = options;
	const method = (init.method ?? 'GET').toUpperCase();

	const headers: Record<string, string> = {
		...(rawHeaders as Record<string, string>)
	};
	if (!BODY_FREE.has(method) && init.body != null) {
		headers['Content-Type'] = 'application/json';
	}

	// A first launch has no session yet. Minting it here, before the request,
	// saves the round trip a 401 would cost — and on a cold-starting free-tier
	// server that round trip is the difference between instant and a minute.
	const token = endpoint.startsWith('/auth/')
		? await getSession()
		: await ensureSession();
	if (token) headers['Authorization'] = `Bearer ${token}`;

	let response: Response;
	try {
		response = await fetch(buildUrl(endpoint, params), {
			...init,
			method,
			headers,
			signal: options.signal
		});
	} catch (err) {
		// A real abort is the caller's decision; a network failure is retried.
		if ((err as Error)?.name === 'AbortError') throw err;
		if (_retry < 2) {
			await new Promise(resolve =>
				setTimeout(resolve, _retry === 0 ? 1200 : 3000)
			);
			return request<T>(endpoint, { ...options, _retry: _retry + 1 });
		}
		throw makeError(
			0,
			`Cannot reach the API at ${API_BASE}. It may be waking up, or this device is offline.`
		);
	}

	const contentType = response.headers.get('content-type') ?? '';
	if (contentType.includes('text/html')) {
		throw makeError(
			response.status,
			`The API base is misconfigured — ${API_BASE} served a web page, not JSON.`
		);
	}

	if (!response.ok) {
		// A guest token can go stale after a server data wipe or a secret
		// change. Re-minting once keeps the app usable instead of showing an
		// error the user has no way to act on.
		if (
			response.status === 401 &&
			!_refreshedSession &&
			!endpoint.startsWith('/auth/')
		) {
			const fresh = await mintGuestSession();
			if (fresh) {
				return request<T>(endpoint, {
					...options,
					_retry,
					_refreshedSession: true
				});
			}
		}

		let detail = `HTTP ${response.status}`;
		let code: string | undefined;
		try {
			const body = (await response.json()) as {
				detail?: string;
				code?: string;
			};
			detail = body?.detail ?? detail;
			if (typeof body?.code === 'string') code = body.code;
		} catch {
			/* not JSON — the status carries the meaning */
		}
		const parsed = splitErrorCode(detail);
		throw makeError(response.status, parsed.message, code ?? parsed.code);
	}

	if (
		response.status === 204 ||
		response.headers.get('content-length') === '0'
	) {
		return undefined as T;
	}

	return (await response.json()) as T;
}

export const api = {
	get: <T>(url: string, opts?: RequestOptions) =>
		request<T>(url, { ...opts, method: 'GET' }),
	post: <T>(url: string, body?: unknown, opts?: RequestOptions) =>
		request<T>(url, {
			...opts,
			method: 'POST',
			body: body != null ? JSON.stringify(body) : undefined
		}),
	put: <T>(url: string, body?: unknown, opts?: RequestOptions) =>
		request<T>(url, {
			...opts,
			method: 'PUT',
			body: body != null ? JSON.stringify(body) : undefined
		}),
	patch: <T>(url: string, body?: unknown, opts?: RequestOptions) =>
		request<T>(url, {
			...opts,
			method: 'PATCH',
			body: body != null ? JSON.stringify(body) : undefined
		}),
	delete: <T>(url: string, opts?: RequestOptions) =>
		request<T>(url, { ...opts, method: 'DELETE' })
};

/** Absolute URL for a media route (audio, artwork) — the player needs one. */
export function mediaUrl(path: string): string {
	return path.startsWith('http') ? path : `${API_BASE}${path}`;
}
