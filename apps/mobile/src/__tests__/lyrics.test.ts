import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hasLyrics, parseLyrics } from '@/lib/lyrics';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
const cache = vi.hoisted(() => ({
	read: vi.fn(),
	save: vi.fn()
}));

vi.mock('@/api/client', () => ({ api: { get } }));
vi.mock('@/lib/lyricsCache', () => ({
	readLyricsFromDevice: cache.read,
	saveLyricsToDevice: cache.save
}));

const { lyricsApi } = await import('@/api/lyrics.api');

beforeEach(() => {
	vi.clearAllMocks();
	cache.save.mockResolvedValue(undefined);
	cache.read.mockResolvedValue(null);
});

describe('parseLyrics', () => {
	it('reads the endpoint shape: a `synced` flag, `lines`, `time` in milliseconds', () => {
		const lyrics = parseLyrics({
			trackId: 'abc',
			synced: true,
			source: 'sidecar',
			lines: [
				{ time: 0, text: 'first' },
				{ time: 12340, text: 'second' }
			]
		});

		expect(lyrics.synced).toEqual([
			{ text: 'first', startTime: 0 },
			{ text: 'second', startTime: 12.34 }
		]);
		expect(lyrics.plain).toBeNull();
		expect(lyrics.source).toBe('sidecar');
	});

	it('joins an untimed answer into plain text', () => {
		const lyrics = parseLyrics({
			synced: false,
			lines: [
				{ time: 0, text: 'one' },
				{ time: 0, text: 'two' }
			]
		});

		expect(lyrics.plain).toBe('one\ntwo');
		expect(lyrics.synced).toBeNull();
	});

	it('treats a timing-free line list as plain even when the flag is wrong', () => {
		const lyrics = parseLyrics({ synced: true, lines: [{ text: 'only words' }] });
		expect(lyrics.plain).toBe('only words');
		expect(lyrics.synced).toBeNull();
	});

	it('keeps the older plain payload readable', () => {
		expect(parseLyrics({ plain: 'a\nb' })).toMatchObject({ plain: 'a\nb', synced: null });
	});

	it('sorts shuffled timing so the sheet can scan it', () => {
		const lyrics = parseLyrics({
			synced: true,
			lines: [
				{ time: 9000, text: 'third' },
				{ time: 1000, text: 'first' },
				{ time: 5000, text: 'second' }
			]
		});
		expect(lyrics.synced?.map(line => line.text)).toEqual(['first', 'second', 'third']);
	});

	it('returns empty for nothing at all', () => {
		expect(parseLyrics({ synced: false, lines: [] })).toMatchObject({ plain: null, synced: null });
		expect(parseLyrics(null)).toMatchObject({ plain: null, synced: null });
		expect(parseLyrics('nope')).toMatchObject({ plain: null, synced: null });
	});
});

describe('hasLyrics', () => {
	it('counts either kind', () => {
		expect(hasLyrics({ plain: 'x', synced: null })).toBe(true);
		expect(hasLyrics({ plain: null, synced: [{ text: 'x', startTime: 1 }] })).toBe(true);
		expect(hasLyrics({ plain: '   ', synced: [] })).toBe(false);
		expect(hasLyrics(null)).toBe(false);
	});
});

describe('lyricsApi.forTrack', () => {
	it('caches what the server returned', async () => {
		get.mockResolvedValue({ synced: true, lines: [{ time: 1000, text: 'hello' }] });

		const lyrics = await lyricsApi.forTrack('track-1');

		expect(get).toHaveBeenCalledWith('/lyrics/track-1');
		expect(lyrics.synced).toEqual([{ text: 'hello', startTime: 1 }]);
		expect(cache.save).toHaveBeenCalledWith('track-1', lyrics);
	});

	it('falls back to the device copy when the request fails', async () => {
		get.mockRejectedValue(new Error('offline'));
		const saved = { plain: null, synced: [{ text: 'cached', startTime: 2 }] };
		cache.read.mockResolvedValue(saved);

		await expect(lyricsApi.forTrack('track-2')).resolves.toEqual(saved);
		expect(cache.save).not.toHaveBeenCalled();
	});

	it('does not cache an empty answer', async () => {
		get.mockResolvedValue({ synced: false, lines: [] });

		await expect(lyricsApi.forTrack('track-3')).resolves.toMatchObject({ plain: null });
		expect(cache.save).not.toHaveBeenCalled();
	});

	it('asks for nothing when there is no track', async () => {
		await expect(lyricsApi.forTrack('')).resolves.toMatchObject({ plain: null });
		expect(get).not.toHaveBeenCalled();
	});
});
