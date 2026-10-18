import { api } from './client';

/**
 * Preferences that follow the account rather than the device.
 *
 * The server owns the whitelist (which keys exist, their types and ranges), so
 * this module deliberately does not duplicate it: it sends what the UI changed
 * and renders what comes back. An unknown key is dropped server-side, which is
 * what lets the app ship a toggle before the backend knows about it.
 */
export const preferencesApi = {
	get: () => api.get<{ preferences: Record<string, unknown> }>('/auth/me/preferences'),

	defaults: () => api.get<{ preferences: Record<string, unknown> }>('/auth/me/preferences/defaults'),

	patch: (preferences: Record<string, unknown>) =>
		api.put<{ preferences: Record<string, unknown> }>('/auth/me/preferences', { preferences })
};
