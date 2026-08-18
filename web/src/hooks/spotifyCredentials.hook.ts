import { useState } from 'react';
import { api } from '@/api/client.api';

const SP_ID_KEY = 'shulker-spotify-client-id';
const SP_SECRET_KEY = 'shulker-spotify-client-secret';

/**
 * Manages Spotify credentials in localStorage and syncs them to the backend.
 * Uses the shared api client so the POST goes to the correct API_BASE on prod.
 */
export function useSpotifyCredentials() {
	const [clientId, setClientIdState] = useState(
		() => localStorage.getItem(SP_ID_KEY) || ''
	);
	const [clientSecret, setClientSecretState] = useState(
		() => localStorage.getItem(SP_SECRET_KEY) || ''
	);

	const hasCredentials = Boolean(clientId && clientSecret);

	const save = (id: string, secret: string) => {
		localStorage.setItem(SP_ID_KEY, id);
		localStorage.setItem(SP_SECRET_KEY, secret);
		setClientIdState(id);
		setClientSecretState(secret);
		api.post('/settings/spotify', {
			clientId: id,
			clientSecret: secret
		}).catch(() => {});
	};

	const clear = () => {
		localStorage.removeItem(SP_ID_KEY);
		localStorage.removeItem(SP_SECRET_KEY);
		setClientIdState('');
		setClientSecretState('');
	};

	return { clientId, clientSecret, hasCredentials, save, clear };
}
