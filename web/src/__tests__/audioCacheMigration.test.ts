import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	sniffAudioMime,
	needsMimeMigration,
	migrateOfflineAudioMime,
	MIGRATION_FLAG_KEY,
	MIN_SNIFF_BYTES
} from '@/lib/audioCacheMigration';

// The single idb mock — every test below injects its own resolve/reject.
const openDBMock = vi.hoisted(() => vi.fn());
vi.mock('idb', () => ({ openDB: openDBMock }));

// ── Byte fixtures ──────────────────────────────────────────────

const bytes = (arr: number[]): Uint8Array => new Uint8Array(arr);

// "ftyp" at bytes 4-7 (m4a/mp4) with a plausible size prefix.
const M4A_HEAD = bytes([
	0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20
]);
// "fLaC"
const FLAC_HEAD = bytes([
	0x66, 0x4c, 0x61, 0x43, 0, 0, 0, 0x22, 0x12, 0, 0x10, 0x64
]);
// "OggS"
const OGG_HEAD = bytes([0x4f, 0x67, 0x67, 0x53, 0, 0x02, 0, 0, 0, 0, 0, 0]);
// "RIFF"…"WAVE"
const WAV_HEAD = bytes([
	0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x41, 0x56, 0x45
]);
// ID3v2 tag followed by an MPEG frame sync (0xFF 0xFB = Layer III).
const MP3_HEAD = bytes([0x49, 0x44, 0x33, 0x04, 0, 0, 0, 0, 0, 0, 0xff, 0xfb]);

describe('sniffAudioMime', () => {
	it('identifies mp4/m4a by the ftyp box', () => {
		expect(sniffAudioMime(M4A_HEAD)).toBe('audio/mp4');
	});

	it('identifies flac, ogg and wav by magic numbers', () => {
		expect(sniffAudioMime(FLAC_HEAD)).toBe('audio/flac');
		expect(sniffAudioMime(OGG_HEAD)).toBe('audio/ogg');
		expect(sniffAudioMime(WAV_HEAD)).toBe('audio/wav');
	});

	it('identifies mp3 by ID3 header and by raw frame sync', () => {
		expect(sniffAudioMime(MP3_HEAD)).toBe('audio/mpeg');
		expect(sniffAudioMime(bytes([0xff, 0xfb, 0x90, 0x00]))).toBe(
			'audio/mpeg'
		);
	});

	it('rejects non-audio bytes (html error page, garbage)', () => {
		const html = new TextEncoder().encode('<!DOCTYPE html>').slice(0, 16);
		expect(sniffAudioMime(html)).toBeNull();
		expect(
			sniffAudioMime(bytes([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))
		).toBeNull();
	});

	it('requires a minimum number of bytes', () => {
		expect(sniffAudioMime(new Uint8Array(MIN_SNIFF_BYTES - 1))).toBeNull();
	});
});

describe('needsMimeMigration', () => {
	it('flags the historical bug: m4a bytes labeled audio/mpeg', () => {
		expect(needsMimeMigration('audio/mpeg', M4A_HEAD)).toBe(true);
	});

	it('flags blank, missing and non-audio labels', () => {
		expect(needsMimeMigration('', M4A_HEAD)).toBe(true);
		expect(needsMimeMigration(null, FLAC_HEAD)).toBe(true);
		expect(needsMimeMigration('text/html', OGG_HEAD)).toBe(true);
	});

	it('accepts a label that matches the bytes, including family spellings', () => {
		expect(needsMimeMigration('audio/mp4', M4A_HEAD)).toBe(false);
		expect(needsMimeMigration('audio/m4a', M4A_HEAD)).toBe(false);
		expect(needsMimeMigration('audio/mpeg', MP3_HEAD)).toBe(false);
		expect(needsMimeMigration('audio/x-flac', FLAC_HEAD)).toBe(false);
	});

	it('flags bytes that match no known container even with an audio label', () => {
		expect(
			needsMimeMigration(
				'audio/mpeg',
				bytes([9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9])
			)
		).toBe(true);
	});
});

// ── End-to-end pass over a fake store ──────────────────────────

interface FakeEntry {
	id: string;
	blob: Blob;
	size: number;
	mime: string;
	fetchedAt: number;
	lastUsed: number;
}

function fakeBlob(parts: number[] | Uint8Array, type: string): Blob {
	const arr = parts instanceof Uint8Array ? parts : new Uint8Array(parts);
	return new Blob([arr.slice().buffer as ArrayBuffer], { type });
}

function freshLocalStorage(): Storage {
	const store = new Map<string, string>();
	return {
		get length() {
			return store.size;
		},
		clear: () => store.clear(),
		getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
		key: () => null,
		removeItem: (k: string) => void store.delete(k),
		setItem: (k: string, v: string) => void store.set(k, v)
	} as Storage;
}

function fakeDb(entries: FakeEntry[]) {
	return {
		getAll: async () => entries.map(e => ({ ...e })),
		put: async (_store: string, entry: FakeEntry) => {
			const i = entries.findIndex(e => e.id === entry.id);
			if (i >= 0) entries[i] = { ...entry };
			else entries.push({ ...entry });
		},
		delete: async (_store: string, id: string) => {
			const i = entries.findIndex(e => e.id === id);
			if (i >= 0) entries.splice(i, 1);
		},
		close: () => {}
	};
}

/** Standard fixture: one mislabeled m4a, one healthy mp3, one un-sniffable blob. */
function seedEntries(): FakeEntry[] {
	return [
		{
			id: 'mislabeled-m4a',
			blob: fakeBlob(M4A_HEAD, 'audio/mpeg'),
			size: M4A_HEAD.length,
			mime: 'audio/mpeg',
			fetchedAt: 1,
			lastUsed: 1
		},
		{
			id: 'healthy-mp3',
			blob: fakeBlob(MP3_HEAD, 'audio/mpeg'),
			size: MP3_HEAD.length,
			mime: 'audio/mpeg',
			fetchedAt: 1,
			lastUsed: 1
		},
		{
			id: 'mystery',
			blob: fakeBlob(
				[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
				'audio/mpeg'
			),
			size: 12,
			mime: 'audio/mpeg',
			fetchedAt: 1,
			lastUsed: 1
		}
	];
}

describe('migrateOfflineAudioMime', () => {
	beforeEach(() => {
		vi.stubGlobal('localStorage', freshLocalStorage());
		openDBMock.mockReset();
	});

	it('relabels mislabeled blobs, keeps healthy ones, drops the unfetchable', async () => {
		const entries = seedEntries();
		openDBMock.mockResolvedValue(fakeDb(entries));

		const report = await migrateOfflineAudioMime({
			refetch: async () => null
		});

		expect(report.scanned).toBe(3);
		expect(report.relabeled).toBe(1);
		expect(report.replaced).toBe(0);
		// 'mystery' cannot be sniffed and the refetch serves nothing — deleted.
		expect(report.deleted).toBe(1);

		const fixed = entries.find(e => e.id === 'mislabeled-m4a')!;
		expect(fixed.mime).toBe('audio/mp4');
		expect(fixed.blob.type).toBe('audio/mp4');

		const healthy = entries.find(e => e.id === 'healthy-mp3')!;
		expect(healthy.mime).toBe('audio/mpeg');

		// Flag set → a second pass is a no-op.
		expect(localStorage.getItem(MIGRATION_FLAG_KEY)).toBeTruthy();
		const second = await migrateOfflineAudioMime({
			refetch: async () => null
		});
		expect(second.scanned).toBe(0);
	});

	it('re-fetches unidentifiable blobs and stores the fresh copy', async () => {
		const entries = seedEntries();
		openDBMock.mockResolvedValue(fakeDb(entries));

		// A duck-typed Response, not `new Response(jsdomBlob)`: in CI the
		// fetch Response constructor is undici's, and feeding it a jsdom Blob
		// produces a body undici cannot re-read — the migration then saw an
		// empty blob, stored nothing, and the entry was deleted. The pass
		// only relies on .ok, .headers.get and .blob(), so stub exactly that.
		const refetch = vi.fn(async (trackId: string) => {
			if (trackId !== 'mystery') return null;
			const blob = fakeBlob(M4A_HEAD, 'audio/mp4');
			return {
				ok: true,
				headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'audio/mp4' : null) },
				blob: async () => blob
			};
		});

		const report = await migrateOfflineAudioMime({ refetch });

		expect(refetch).toHaveBeenCalledWith('mystery');
		expect(report.replaced).toBe(1);
		expect(report.relabeled).toBe(1); // the m4a case still relabeled
		const fixed = entries.find(e => e.id === 'mystery')!;
		expect(fixed.mime).toBe('audio/mp4');
		expect(fixed.blob.type).toBe('audio/mp4');
	});

	it('deletes blobs that are neither sniffable nor fetchable', async () => {
		const entries = seedEntries();
		openDBMock.mockResolvedValue(fakeDb(entries));

		const report = await migrateOfflineAudioMime({
			refetch: async () => null
		});

		expect(report.deleted).toBe(1);
		expect(entries.find(e => e.id === 'mystery')).toBeUndefined();
		expect(entries).toHaveLength(2);
	});

	it('marks the pass incomplete at the refetch cap and leaves the flag unset', async () => {
		const entries = seedEntries();
		openDBMock.mockResolvedValue(fakeDb(entries));

		const report = await migrateOfflineAudioMime({
			refetch: async () => null,
			maxRefetches: 0
		});

		// Mystery survives (skipped, not deleted) so a later pass can retry it.
		expect(entries.find(e => e.id === 'mystery')).toBeDefined();
		expect(report.deleted).toBe(0);
		expect(report.incomplete).toBe(true);
		expect(localStorage.getItem(MIGRATION_FLAG_KEY)).toBeNull();
	});

	it('resolves with an empty report when the flag is already set', async () => {
		localStorage.setItem(MIGRATION_FLAG_KEY, '1');
		openDBMock.mockRejectedValue(new Error('should never be opened'));

		const report = await migrateOfflineAudioMime({
			refetch: async () => null
		});
		expect(report.scanned).toBe(0);
		expect(report.incomplete).toBe(false);
	});

	it('reports through onDone even when the store cannot open', async () => {
		openDBMock.mockRejectedValue(new Error('blocked'));
		const onDone = vi.fn();

		const report = await migrateOfflineAudioMime({
			refetch: async () => null,
			onDone
		});

		expect(onDone).toHaveBeenCalledTimes(1);
		expect(report.scanned).toBe(0);
		expect(report.incomplete).toBe(true);
	});
});
