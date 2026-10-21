/**
 * The device's own session.
 *
 * Rheoson on a phone opens straight into the app — no sign-in wall — so the
 * identity behind every request is a *guest session* the server mints for this
 * install the first time it asks (`POST /api/auth/guest`). It is a real
 * account from the server's point of view: likes, history, playlists and
 * follows are keyed to it and survive restarts, and it can never touch
 * another identity's data because the id is generated server-side.
 *
 * The token lives in the keychain (`expo-secure-store`), not AsyncStorage:
 * it is a bearer credential, and on Android AsyncStorage is a plain file any
 * backup can read.
 *
 * `getSession()` is called from the API client on every request, so it is
 * cached in memory and only touches the keychain once per launch.
 */

import * as SecureStore from 'expo-secure-store';

import { API_BASE } from '@/constants/config';

const TOKEN_KEY = 'rheoson.guest.token';
const SUB_KEY = 'rheoson.guest.sub';
/** Long enough for a sleeping free-tier server to wake up. */
const MINT_TIMEOUT_MS = 40_000;

let cached: string | null = null;
/** Serialises concurrent mints: ten parallel requests must not create ten guests. */
let inFlight: Promise<string | null> | null = null;

/** The identity behind this install, for Settings → Account. */
export async function getSessionSub(): Promise<string | null> {
	try {
		return await SecureStore.getItemAsync(SUB_KEY);
	} catch {
		return null;
	}
}

/**
 * The stored token, or null when this install has never asked for one.
 *
 * Never mints: callers that need a *working* session call `ensureSession()`.
 */
export async function getSession(): Promise<string | null> {
	if (cached) return cached;
	try {
		cached = await SecureStore.getItemAsync(TOKEN_KEY);
	} catch {
		cached = null;
	}
	return cached;
}

async function store(token: string, sub: string | null): Promise<void> {
	cached = token;
	try {
		await SecureStore.setItemAsync(TOKEN_KEY, token);
		if (sub) await SecureStore.setItemAsync(SUB_KEY, sub);
	} catch {
		// A device with no keychain still works for this launch; the token is
		// re-minted next time rather than blocking the app now.
	}
}

/**
 * Ask the server for a fresh guest session.
 *
 * Returns null when the instance refuses guests (`ACF02`) or cannot sign
 * tokens — a deliberate configuration, not an error to retry against.
 */
export async function mintGuestSession(): Promise<string | null> {
	if (inFlight) return inFlight;

	const attempt = (async (): Promise<string | null> => {
		// A free-tier server can take most of a minute to wake from sleep, so the
		// first try waits long enough for that, and one retry covers a request
		// that landed while it was still booting. Never loops further: a phone
		// with no signal should fail quietly and try again on the next request.
		for (let tryNumber = 0; tryNumber < 2; tryNumber += 1) {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), MINT_TIMEOUT_MS);
			try {
				const res = await fetch(`${API_BASE}/auth/guest`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ device: 'android' }),
					signal: controller.signal
				});
				// 403 is the instance saying "no guests" on purpose; retrying that
				// would only repeat the answer.
				if (res.status === 403) return null;
				if (!res.ok) continue;
				const body = (await res.json()) as {
					token?: string;
					user?: { id?: string };
				};
				if (!body?.token) continue;
				await store(body.token, body.user?.id ?? null);
				return body.token;
			} catch {
				// Offline or timed out: fall through to the retry, then give up
				// quietly. The app keeps showing whatever is cached locally.
			} finally {
				clearTimeout(timer);
			}
		}
		return null;
	})();

	inFlight = attempt;
	try {
		return await attempt;
	} finally {
		inFlight = null;
	}
}

/**
 * A session that is safe to build requests with: the stored one when it
 * exists, otherwise a freshly minted one.
 */
export async function ensureSession(): Promise<string | null> {
	return (await getSession()) ?? (await mintGuestSession());
}

/** Drop the session — used by Settings → Reset, which also clears local data. */
export async function clearSession(): Promise<void> {
	cached = null;
	try {
		await SecureStore.deleteItemAsync(TOKEN_KEY);
		await SecureStore.deleteItemAsync(SUB_KEY);
	} catch {
		/* nothing stored, or no keychain: both are already the desired state */
	}
}
