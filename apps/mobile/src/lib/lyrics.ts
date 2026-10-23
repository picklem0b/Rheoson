/**
 * What the lyrics endpoint actually returns, and how to read it.
 *
 * `/api/lyrics/{trackId}` answers with
 *
 *     { "trackId": "…", "synced": true,
 *       "lines": [{ "time": 12340, "text": "…" }], "source": "sidecar" }
 *
 * — `synced` is a flag, `lines` always carries the text, and `time` is
 * milliseconds. Reading `plain`/`synced[]` out of that (a shape the server has
 * never sent) silently produced an empty sheet for every track, so the parsing
 * lives here, in one pure function a test can pin down.
 *
 * Older shapes are still accepted: a `plain` string, and an array under
 * `synced`. A cached payload written by an earlier build keeps working.
 */

export interface LyricLine {
	/** Seconds into the track, when the source had timings. */
	startTime?: number;
	text: string;
}

export interface Lyrics {
	/** Plain lyric text, or null when nothing was found. */
	plain: string | null;
	/** Timed lines, or null when the source was untimed. */
	synced: LyricLine[] | null;
	source?: string;
}

export const EMPTY_LYRICS: Lyrics = { plain: null, synced: null };

interface RawLine {
	time?: number | string | null;
	startTime?: number | string | null;
	text?: unknown;
}

function numberOrUndefined(value: unknown): number | undefined {
	const numeric = typeof value === 'string' ? Number(value) : value;
	return typeof numeric === 'number' && Number.isFinite(numeric) ? numeric : undefined;
}

function textLines(lines: RawLine[]): string[] {
	return lines
		.map(line => (typeof line?.text === 'string' ? line.text.trim() : ''))
		.filter(Boolean);
}

/**
 * Is this a line list the server has timed?
 *
 * Plain lyrics arrive as `lines` with every `time` set to 0 — the schema has
 * no other way to say "untimed" — so a zero-only list is text, not timings.
 * Requiring a positive offset is what tells the two apart.
 */
function isTimed(lines: RawLine[]): boolean {
	return lines.some(line => (numberOrUndefined(line?.time ?? line?.startTime) ?? 0) > 0);
}

function toSynced(lines: RawLine[]): LyricLine[] {
	const timed: LyricLine[] = [];
	for (const line of lines) {
		const text = typeof line?.text === 'string' ? line.text.trim() : '';
		if (!text) continue;
		const raw = numberOrUndefined(line.time ?? line.startTime);
		// `time` is milliseconds; `startTime` is already seconds.
		const startTime =
			line.time !== undefined && line.time !== null && raw !== undefined ? raw / 1000 : raw;
		timed.push(startTime === undefined ? { text } : { text, startTime });
	}
	// An unsorted or partly-timed file still plays correctly if the timing is
	// monotonic, which is what the sheet's active-line scan assumes.
	return timed.sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));
}

export function parseLyrics(payload: unknown): Lyrics {
	if (!payload || typeof payload !== 'object') return EMPTY_LYRICS;
	const raw = payload as {
		synced?: unknown;
		lines?: unknown;
		plain?: unknown;
		lyrics?: unknown;
		source?: unknown;
	};
	const source = typeof raw.source === 'string' && raw.source ? raw.source : undefined;

	// Current shape: lines + a `synced` flag.
	if (Array.isArray(raw.lines)) {
		const lines = raw.lines as RawLine[];
		const texts = textLines(lines);
		if (texts.length === 0) return { ...EMPTY_LYRICS, source };
		if (isTimed(lines)) {
			return { plain: null, synced: toSynced(lines), source };
		}
		return { plain: texts.join('\n'), synced: null, source };
	}

	// Earlier shape: synced already an array of lines.
	if (Array.isArray(raw.synced)) {
		const synced = toSynced(raw.synced as RawLine[]);
		if (synced.length > 0) return { plain: null, synced, source };
	}

	const plain =
		typeof raw.plain === 'string' ? raw.plain : typeof raw.lyrics === 'string' ? raw.lyrics : null;
	if (plain && plain.trim()) return { plain, synced: null, source };
	return { ...EMPTY_LYRICS, source };
}

/** True when there is something worth showing. */
export function hasLyrics(lyrics: Lyrics | null | undefined): boolean {
	if (!lyrics) return false;
	if ((lyrics.synced?.length ?? 0) > 0) return true;
	return Boolean(lyrics.plain?.trim());
}
