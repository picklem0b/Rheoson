import * as FileSystem from 'expo-file-system';

import { hasLyrics, type Lyrics } from '@/lib/lyrics';

/**
 * Lyrics kept next to the audio that is kept on the phone.
 *
 * A saved track plays with no connection, so its lyrics have to be on the
 * device too — otherwise "keep on this device" produces a song that loses its
 * words the moment the train enters a tunnel. Every successful fetch writes
 * here, and the player reads this copy when the request fails.
 *
 * Stored as the parsed shape rather than the raw `.lrc` the CLI writes: the
 * server is the one that reads sidecars and resolves provider lyrics, so by
 * the time a payload reaches the phone it is already normalised, and a cache
 * of that payload needs no second parser.
 */
const DIRECTORY = `${FileSystem.documentDirectory ?? ''}offline-lyrics/`;

function safeName(trackId: string): string {
	const cleaned = trackId.replace(/[^a-zA-Z0-9_-]/g, '');
	return cleaned || 'track';
}

function fileFor(trackId: string): string {
	return `${DIRECTORY}${safeName(trackId)}.json`;
}

async function ensureDirectory(): Promise<boolean> {
	if (!FileSystem.documentDirectory) return false;
	try {
		const info = await FileSystem.getInfoAsync(DIRECTORY);
		if (!info.exists) await FileSystem.makeDirectoryAsync(DIRECTORY, { intermediates: true });
		return true;
	} catch {
		return false;
	}
}

/**
 * Keep one track's lyrics on the device.
 *
 * Blank payloads are refused: lyrics that were not found are not a fact worth
 * persisting, and a later successful fetch must not be shadowed by an empty
 * cached answer.
 */
export async function saveLyricsToDevice(trackId: string, lyrics: Lyrics): Promise<void> {
	if (!trackId || !hasLyrics(lyrics)) return;
	if (!(await ensureDirectory())) return;

	const target = fileFor(trackId);
	const temporary = `${target}.part`;
	try {
		await FileSystem.writeAsStringAsync(temporary, JSON.stringify(lyrics));
		await FileSystem.moveAsync({ from: temporary, to: target });
	} catch {
		await FileSystem.deleteAsync(temporary, { idempotent: true }).catch(() => undefined);
	}
}

/** The lyrics saved for a track, or null when none were. */
export async function readLyricsFromDevice(trackId: string): Promise<Lyrics | null> {
	if (!trackId) return null;
	try {
		const info = await FileSystem.getInfoAsync(fileFor(trackId));
		if (!info.exists) return null;
		const text = await FileSystem.readAsStringAsync(info.uri);
		const parsed = JSON.parse(text) as Lyrics;
		return hasLyrics(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

/** Forget one track's lyrics. Safe when none were saved. */
export async function removeLyricsFor(trackId: string): Promise<void> {
	try {
		await FileSystem.deleteAsync(fileFor(trackId), { idempotent: true });
	} catch {
		/* already gone */
	}
}

/** Remove every saved lyric file. */
export async function clearSavedLyrics(): Promise<void> {
	try {
		await FileSystem.deleteAsync(DIRECTORY, { idempotent: true });
	} catch {
		/* nothing saved */
	}
}
