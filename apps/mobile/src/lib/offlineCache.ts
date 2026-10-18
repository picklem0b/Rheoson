/**
 * The device's own copy of what the account owns.
 *
 * The server is the source of truth for likes, history, playlists and
 * follows, but a phone is offline for real stretches — a train, a plane, a
 * dead spot — and "no signal" must not mean "your library is empty". Every
 * section is stored as one JSON envelope under an account-scoped key, with
 * the write time inside so a reader can decide staleness for itself.
 *
 * No TTL on purpose: the alternative to a three-week-old liked list is a
 * spinner. Blank payloads are refused outright, because the case that produces
 * them is a failed revalidation, and that must never erase the only copy of
 * something the user saved.
 *
 * The website writes the same envelope shape in `localState.ts`, so a cache
 * dumped from either client can be read by the other.
 */
import { readJson, writeJson, remove } from '@/lib/storage';

const FORMAT = 'rheoson-cache';
const VERSION = 1;

export const CACHE_SECTIONS = [
	'liked',
	'history',
	'playlists',
	'following',
	'library',
	'albums',
	'artists'
] as const;

export type CacheSection = (typeof CACHE_SECTIONS)[number];

export interface CacheEnvelope<T = unknown> {
	format: typeof FORMAT;
	version: number;
	section: string;
	user: string;
	updatedAt: string;
	data: T;
}

function key(section: string, user: string): string {
	return `rheoson.cache.${section}.${user}`;
}

/** Mirror one section. Fire-and-forget; never throws. */
export async function writeOfflineCache(
	section: string,
	user: string,
	data: unknown
): Promise<void> {
	const blank = data == null || (Array.isArray(data) && data.length === 0);
	if (blank || !user) return;

	const envelope: CacheEnvelope = {
		format: FORMAT,
		version: VERSION,
		section,
		user,
		updatedAt: new Date().toISOString(),
		data
	};
	await writeJson(key(section, user), envelope);
}

/** Read a section back, or null when it was never written / is unreadable. */
export async function readOfflineCache<T = unknown>(
	section: string,
	user: string
): Promise<CacheEnvelope<T> | null> {
	if (!user) return null;
	const parsed = await readJson<CacheEnvelope<T>>(key(section, user));
	if (!parsed || parsed.format !== FORMAT || typeof parsed.updatedAt !== 'string') return null;
	return parsed;
}

/** Forget every section for one account — used by Settings → Reset. */
export async function clearOfflineCache(user: string): Promise<void> {
	await Promise.all(CACHE_SECTIONS.map(section => remove(key(section, user))));
}
