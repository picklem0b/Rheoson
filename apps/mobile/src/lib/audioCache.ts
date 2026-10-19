import * as FileSystem from 'expo-file-system';

import { API_ORIGIN } from '@/constants/config';

/**
 * Audio kept on the phone.
 *
 * This is the app's one genuine advantage over the web player: a song saved
 * here plays with no connection at all, because the file is on the device and
 * the player is handed a `file://` URL instead of a stream. The server does not
 * need to be awake, and the bytes do not cross the network twice.
 *
 * A complete file is downloaded to `.part` and only then moved into place, so a
 * download that is interrupted never leaves something that looks playable. The
 * in-memory map is a per-launch index: once a track has been checked, the
 * player asks about it on every queue sync, and a filesystem stat per track per
 * sync would be pointless work.
 */
const DIRECTORY = `${FileSystem.documentDirectory ?? ''}offline-audio/`;

/** trackId → file URI, or null when it is known not to be on the device. */
const known = new Map<string, string | null>();

function safeName(trackId: string): string {
	const cleaned = trackId.replace(/[^a-zA-Z0-9_-]/g, '');
	return cleaned || 'track';
}

function fileFor(trackId: string): string {
	return `${DIRECTORY}${safeName(trackId)}.m4a`;
}

function streamUrl(trackId: string): string {
	return `${API_ORIGIN}/api/stream/${trackId}/audio`;
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

/** The local file for a track, or null when it has not been saved. */
export async function cachedAudioUri(trackId: string): Promise<string | null> {
	const memo = known.get(trackId);
	if (memo !== undefined) return memo;

	try {
		const info = await FileSystem.getInfoAsync(fileFor(trackId));
		if (info.exists) {
			known.set(trackId, info.uri);
			return info.uri;
		}
	} catch {
		// Fall through: no file, or no permission to ask.
	}
	known.set(trackId, null);
	return null;
}

/**
 * Download a track for offline play.
 *
 * Returns the file size on success and null on failure. The caller decides how
 * to say either out loud; this function does not toast, because it is also used
 * by a batch save that wants one message for many tracks.
 */
export async function saveAudio(
	trackId: string,
	onProgress?: (fraction: number) => void
): Promise<number | null> {
	if (!(await ensureDirectory())) return null;

	const target = fileFor(trackId);
	const temporary = `${target}.part`;

	try {
		const download = FileSystem.createDownloadResumable(streamUrl(trackId), temporary, {}, data => {
			if (data.totalBytesExpectedToWrite > 0) {
				onProgress?.(data.totalBytesWritten / data.totalBytesExpectedToWrite);
			}
		});
		const result = await download.downloadAsync();
		if (!result || result.status < 200 || result.status >= 300) {
			await FileSystem.deleteAsync(temporary, { idempotent: true });
			return null;
		}
		await FileSystem.moveAsync({ from: temporary, to: target });
		known.set(trackId, target);

		const info = await FileSystem.getInfoAsync(target);
		return info.exists ? info.size : 0;
	} catch {
		await FileSystem.deleteAsync(temporary, { idempotent: true }).catch(() => undefined);
		known.set(trackId, null);
		return null;
	}
}

/** Forget one saved track. Safe when it was never saved. */
export async function removeAudio(trackId: string): Promise<void> {
	known.set(trackId, null);
	try {
		await FileSystem.deleteAsync(fileFor(trackId), { idempotent: true });
	} catch {
		/* already gone */
	}
}

/** Every saved track and its size, read from the directory itself. */
export async function listSavedAudio(): Promise<{ trackId: string; bytes: number }[]> {
	if (!(await ensureDirectory())) return [];
	try {
		const names = await FileSystem.readDirectoryAsync(DIRECTORY);
		const saved: { trackId: string; bytes: number }[] = [];
		for (const name of names) {
			if (!name.endsWith('.m4a')) continue;
			const trackId = name.slice(0, -4);
			const info = await FileSystem.getInfoAsync(`${DIRECTORY}${name}`);
			if (info.exists) saved.push({ trackId, bytes: info.size });
		}
		return saved;
	} catch {
		return [];
	}
}

/** Remove every saved track. */
export async function clearSavedAudio(): Promise<void> {
	known.clear();
	try {
		await FileSystem.deleteAsync(DIRECTORY, { idempotent: true });
	} catch {
		/* nothing saved */
	}
}
