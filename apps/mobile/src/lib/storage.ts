/**
 * Thin JSON layer over AsyncStorage.
 *
 * AsyncStorage is the one store available on both of this app's platforms and
 * survives restarts, so every "remember this between launches" need goes
 * through here rather than each caller inventing its own serialisation.
 * Failures are swallowed by design: a device with a full disk or a revoked
 * storage permission must not take the app down with it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Read a JSON value, or null when it is absent or unreadable. */
export async function readJson<T>(key: string): Promise<T | null> {
	try {
		const raw = await AsyncStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : null;
	} catch {
		return null;
	}
}

/** Write a JSON value. Returns false when the write did not happen. */
export async function writeJson(key: string, value: unknown): Promise<boolean> {
	try {
		await AsyncStorage.setItem(key, JSON.stringify(value));
		return true;
	} catch {
		return false;
	}
}

export async function remove(key: string): Promise<void> {
	try {
		await AsyncStorage.removeItem(key);
	} catch {
		/* already gone */
	}
}

/** Every key this app owns, for a reset. */
export async function keysMatching(prefix: string): Promise<string[]> {
	try {
		const keys = await AsyncStorage.getAllKeys();
		return keys.filter(key => key.startsWith(prefix));
	} catch {
		return [];
	}
}
