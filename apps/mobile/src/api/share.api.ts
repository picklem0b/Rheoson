import { api } from './client';

/**
 * Sharing.
 *
 * The server builds the link so the URL scheme (site, path, query) stays in one
 * place: a phone that hard-coded its own share URL would keep pointing at the
 * old one after the site moved. When the call fails the caller falls back to
 * plain text, which is still useful in a chat.
 */
export const shareApi = {
	link: (trackId: string, title: string, artist: string) =>
		api.get<{ url: string; deeplink?: string }>(`/share/${trackId}/link`, {
			params: { title, artist }
		})
};
