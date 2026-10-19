import { Share } from 'react-native';

import { shareApi } from '@/api/share.api';
import type { Track } from '@rheoson/api-types';

/**
 * Send a track to another app.
 *
 * The link comes from the server, so the URL shape lives in one place, but a
 * failed request must not make the share button look broken: the title and
 * artist alone are still a useful message. That fallback is why this returns
 * nothing and never throws.
 */
export async function shareTrack(track: Track): Promise<void> {
	const artist = track.artist?.name ?? '';
	let url = '';
	try {
		url = (await shareApi.link(track.id, track.title, artist)).url;
	} catch {
		// Sharing text without a link is better than not sharing at all.
	}
	await Share.share({
		message: [artist ? `${track.title} — ${artist}` : track.title, url].filter(Boolean).join('\n')
	});
}
