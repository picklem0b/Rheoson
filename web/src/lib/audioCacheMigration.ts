/**
 * One-time migration: repair mislabeled offline audio blobs.
 *
 * Older builds stored every cached blob as "audio/mpeg" regardless of what
 * the server actually sent. The player now derives Howler's format hint from
 * the real container (see `mimeToExt` in audioCache.ts), so an m4a blob
 * labeled mp3 makes Android WebView refuse to decode — the track loads
 * forever and never starts. This pass walks the offline store once and:
 *
 *   1. relabels blobs whose actual bytes identify a different container
 *      (magic-number sniff — instant, no network),
 *   2. re-fetches anything unidentifiable from the stream endpoint (the same
 *      public URL the <audio> element itself plays, so a bare fetch carries
 *      exactly as much auth as playback does — none is needed),
 *   3. deletes the tiny residue that is neither sniffable nor fetchable,
 *      because a mystery blob can only fail to play again.
 *
 * Runs at most once per schema generation (flag in localStorage), and it is
 * idempotent anyway: every branch leaves the store strictly more playable
 * than it found it. Failures are swallowed — the cache must degrade to
 * streaming, never break boot.
 */

import { openDB, type IDBPDatabase } from 'idb';

// Keep in sync with DB_VERSION in audioCache.ts — this migration exists for
// the generation that introduced real mime labels.
export const MIGRATION_SCHEMA_VERSION = 2;
export const MIGRATION_FLAG_KEY = 'rheoson-audio-mime-migration-v2';

/** Minimum bytes a head must have for sniffing to be meaningful. */
export const MIN_SNIFF_BYTES = 4;

const DB_NAME = 'rheoson-audio';
const DB_VERSION = 2;
const STORE = 'audio';

/** Cap the network work a single pass may do — boot must stay cheap. */
const DEFAULT_MAX_REFETCHES = 12;
const MAX_HEAD_BYTES = 16;

const AUDIO_MIME_RE = /^audio\//i;

interface CachedAudio {
	id: string;
	blob: Blob;
	size: number;
	mime: string;
	fetchedAt: number;
	lastUsed: number;
}

export interface MigrationReport {
	/** Entries inspected. */
	scanned: number;
	/** Fixed in place by re-labeling from sniffed bytes. */
	relabeled: number;
	/** Fixed by re-downloading the track. */
	replaced: number;
	/** Unidentifiable and unfetchable — removed rather than left broken. */
	deleted: number;
	/** Unexpected per-entry failures (writes, aborts). */
	errors: number;
	/** True when the refetch cap stopped the pass early; flag not set. */
	incomplete: boolean;
}

// ── Pure helpers (unit-tested without IndexedDB) ───────────────

/**
 * Identify an audio container from its leading bytes.
 * Returns a canonical mime, or null when the bytes match nothing we play.
 */
export function sniffAudioMime(head: Uint8Array): string | null {
	if (head.length < MIN_SNIFF_BYTES) return null;

	const ascii = (start: number, end: number): string => {
		let out = '';
		for (let i = start; i < end; i += 1)
			out += String.fromCharCode(head[i]);
		return out;
	};

	// MP4 family (m4a audio): bytes 4-7 are the ASCII box name "ftyp".
	if (ascii(4, 8) === 'ftyp') return 'audio/mp4';

	// FLAC: "fLaC"
	if (
		head[0] === 0x66 &&
		head[1] === 0x4c &&
		head[2] === 0x61 &&
		head[3] === 0x43
	) {
		return 'audio/flac';
	}

	// OGG / Opus: "OggS"
	if (
		head[0] === 0x4f &&
		head[1] === 0x67 &&
		head[2] === 0x67 &&
		head[3] === 0x53
	) {
		return 'audio/ogg';
	}

	// WAV: "RIFF" … "WAVE" at bytes 8-11.
	if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return 'audio/wav';

	// MPEG audio (mp3): sync word 0xFFEx (any layer, any bitrate, no CRC).
	const sync = (head[0] << 8) | head[1];
	if ((sync & 0xffe0) === 0xffe0 && (head[1] & 0x18) !== 0x08)
		return 'audio/mpeg';

	// ID3v2 header means an mp3 or (rarely) a tagged m4a — the sync-word check
	// above already handled plain mpeg, and ID3 on an m4a is vanishingly rare
	// in practice; trust ID3 as mp3.
	if (ascii(0, 3) === 'ID3') return 'audio/mpeg';

	return null;
}

/**
 * Does this entry carry a mime label its own bytes contradict (or none at
 * all)? Pure so tests can exercise the matrix without a database.
 */
export function needsMimeMigration(
	declaredMime: string | null | undefined,
	head: Uint8Array
): boolean {
	if (head.length < MIN_SNIFF_BYTES) return false;

	// No label, or a label that is not audio (text/html error page, empty
	// string, octet-stream): untrustworthy either way.
	if (!declaredMime || !AUDIO_MIME_RE.test(declaredMime)) return true;

	const actual = sniffAudioMime(head);
	if (!actual) {
		// Bytes match no known container. A label claiming mp3 is very likely
		// wrong (the old bug) — a genuinely broken blob plays as silence.
		return true;
	}

	// Same family, different spelling ("audio/mp4" vs "audio/m4a"): fine.
	if (sameFamily(declaredMime, actual)) return false;

	return true;
}

function sameFamily(a: string, b: string): boolean {
	const norm = (m: string): string => {
		if (m.includes('mp4') || m.includes('m4a') || m.includes('aac'))
			return 'mp4';
		if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
		if (m.includes('ogg') || m.includes('opus')) return 'ogg';
		if (m.includes('wav')) return 'wav';
		if (m.includes('flac')) return 'flac';
		return 'other';
	};
	return norm(a) === norm(b);
}

/** Re-label a blob without copying its bytes. */
function relabelBlob(blob: Blob, mime: string): Blob {
	try {
		return blob.slice(0, blob.size, mime);
	} catch {
		return blob;
	}
}

// ── The pass itself ────────────────────────────────────────────

/** Open the store independently of the app's own cached connection. */
async function _openStore(): Promise<IDBPDatabase | null> {
	try {
		return await openDB(DB_NAME, DB_VERSION, {
			upgrade(db) {
				if (!db.objectStoreNames.contains(STORE)) {
					const store = db.createObjectStore(STORE, {
						keyPath: 'id'
					});
					store.createIndex('by-last-used', 'lastUsed');
				}
			}
		});
	} catch {
		return null;
	}
}

async function _headOf(blob: Blob): Promise<Uint8Array | null> {
	try {
		const buf = await blob.slice(0, MAX_HEAD_BYTES).arrayBuffer();
		return new Uint8Array(buf);
	} catch {
		return null;
	}
}

/** Stream URL for a track — the same endpoint playback itself uses. */
function _streamUrl(trackId: string): string {
	return `/api/stream/${encodeURIComponent(trackId)}/audio`;
}

export function _defaultRefetch(trackId: string): Promise<Response> {
	return fetch(_streamUrl(trackId), { credentials: 'include' });
}

/**
 * Run the migration if it has not run for this schema generation yet.
 * Fire-and-forget safe: never throws, reports through `onDone` if given.
 */
export async function migrateOfflineAudioMime(
	opts: {
		refetch?: (trackId: string) => Promise<Response | null>;
		maxRefetches?: number;
		onDone?: (report: MigrationReport) => void;
	} = {}
): Promise<MigrationReport> {
	const empty: MigrationReport = {
		scanned: 0,
		relabeled: 0,
		replaced: 0,
		deleted: 0,
		errors: 0,
		incomplete: false
	};

	try {
		if (
			typeof localStorage !== 'undefined' &&
			localStorage.getItem(MIGRATION_FLAG_KEY)
		) {
			opts.onDone?.(empty);
			return empty;
		}
	} catch {
		/* storage blocked — still run once per boot; the pass is idempotent */
	}

	const report: MigrationReport = { ...empty, incomplete: true };
	const db = await _openStore();
	if (!db) {
		opts.onDone?.(report);
		return report;
	}

	try {
		const all = (await db.getAll(STORE)) as CachedAudio[];
		const maxRefetches = opts.maxRefetches ?? DEFAULT_MAX_REFETCHES;
		let refetches = 0;

		for (const entry of all) {
			if (!entry?.blob || (entry.size ?? 0) <= 0) continue;
			report.scanned += 1;

			const head = await _headOf(entry.blob);
			if (!head) continue;
			const declared = entry.blob.type || entry.mime || '';
			if (!needsMimeMigration(declared, head)) continue;

			// 1. Bytes identify a container — relabel in place, zero network.
			const sniffed = sniffAudioMime(head);
			if (sniffed) {
				entry.blob = relabelBlob(entry.blob, sniffed);
				entry.mime = sniffed;
				entry.lastUsed = Date.now();
				await db.put(STORE, entry);
				report.relabeled += 1;
				continue;
			}

			// 2. Unidentifiable bytes — try a clean re-download. Skip rather than
			//    delete when the refetch budget is spent so nothing is lost.
			if (refetches >= maxRefetches) continue;
			refetches += 1;

			let res: Response | null = null;
			try {
				const result = (opts.refetch ?? _defaultRefetch)(entry.id);
				res = result instanceof Promise ? await result : result;
			} catch {
				res = null;
			}

			console.log('REFETCH DEBUG: ', {
				res,
				ok: res?.ok,
				status: res?.status,
				blob: res ? await res.clone().blob() : null
			});
			if (res && res.ok) {
				try {
					const blob = await res.blob();
					const newHead = await _headOf(blob);
					const sniffedNew = newHead ? sniffAudioMime(newHead) : null;
					const ct = res.headers.get('content-type') ?? '';
					const finalMime =
						sniffedNew ??
						(ct && AUDIO_MIME_RE.test(ct)
							? ct.split(';')[0].trim()
							: null);

					if (blob.size > 0 && finalMime) {
						await db.put(STORE, {
							...entry,
							blob,
							size: blob.size,
							mime: finalMime,
							fetchedAt: Date.now(),
							lastUsed: Date.now()
						});
						report.replaced += 1;
						continue;
					}
				} catch {
					report.errors += 1;
					continue;
				}
			}

			// 3. Nothing worked — the blob is unplayable as-is. Drop it so the
			//    player falls back to streaming instead of failing on a broken
			//    cached copy.
			try {
				await db.delete(STORE, entry.id);
				report.deleted += 1;
			} catch {
				report.errors += 1;
			}
		}

		report.incomplete = refetches >= maxRefetches;
		if (!report.incomplete) {
			try {
				localStorage.setItem(MIGRATION_FLAG_KEY, String(Date.now()));
			} catch {
				/* flag write failed — next boot re-scans, which is harmless */
			}
		}
		return report;
	} catch {
		report.errors += 1;
		return report;
	} finally {
		db.close();
		opts.onDone?.(report);
	}
}
