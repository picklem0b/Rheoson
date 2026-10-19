import { api } from './client';

/**
 * Listening history, in aggregate.
 *
 * These types mirror the server's snake_case payloads exactly, converted once
 * here. The previous version of this module declared a richer shape than the
 * API returns — `totalSeconds`, `trackCount`, per-date buckets — so every
 * consumer would have rendered zeros while the data existed under other names.
 * The endpoints are the contract; this file follows them.
 */
export interface ListeningSummary {
	totalPlays: number;
	plays7d: number;
	plays30d: number;
	totalLikes: number;
	uniqueArtists30d: number;
	activeDays30d: number;
	/** The server estimates this from play counts, not stream seconds. */
	estimatedListeningHours: number;
	currentStreak: number;
	longestStreak: number;
}

export interface TopTrackPlay {
	trackId: string;
	plays: number;
}

export interface TopArtistPlay {
	name: string;
	plays: number;
}

export interface HourPlay {
	hour: number;
	plays: number;
}

export interface DayPlay {
	day: string;
	plays: number;
}

interface SummaryPayload {
	total_plays?: number;
	plays_7d?: number;
	plays_30d?: number;
	total_likes?: number;
	unique_artists_30d?: number;
	active_days_30d?: number;
	estimated_listening_hours?: number;
	current_streak?: number;
	longest_streak?: number;
}

function number(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export const analyticsApi = {
	stats: async (): Promise<ListeningSummary> => {
		const raw = await api.get<SummaryPayload>('/analytics/stats');
		return {
			totalPlays: number(raw?.total_plays),
			plays7d: number(raw?.plays_7d),
			plays30d: number(raw?.plays_30d),
			totalLikes: number(raw?.total_likes),
			uniqueArtists30d: number(raw?.unique_artists_30d),
			activeDays30d: number(raw?.active_days_30d),
			estimatedListeningHours: number(raw?.estimated_listening_hours),
			currentStreak: number(raw?.current_streak),
			longestStreak: number(raw?.longest_streak)
		};
	},

	topTracks: async (days = 30, limit = 10): Promise<TopTrackPlay[]> => {
		const raw = await api.get<{ tracks?: { track_id?: string; plays?: number }[] }>(
			'/analytics/top-tracks',
			{ params: { days, limit } }
		);
		return (raw?.tracks ?? [])
			.filter(item => typeof item.track_id === 'string')
			.map(item => ({ trackId: String(item.track_id), plays: number(item.plays) }));
	},

	topArtists: async (days = 30, limit = 10): Promise<TopArtistPlay[]> => {
		const raw = await api.get<{ artists?: { artist?: string; plays?: number }[] }>(
			'/analytics/top-artists',
			{ params: { days, limit } }
		);
		return (raw?.artists ?? [])
			.filter(item => typeof item.artist === 'string')
			.map(item => ({ name: String(item.artist), plays: number(item.plays) }));
	},

	listeningByHour: async (days = 30): Promise<HourPlay[]> => {
		const raw = await api.get<{ hours?: { hour?: number; plays?: number }[] }>(
			'/analytics/listening-by-hour',
			{ params: { days } }
		);
		return (raw?.hours ?? []).map(item => ({
			hour: number(item.hour),
			plays: number(item.plays)
		}));
	},

	listeningByDay: async (days = 7): Promise<DayPlay[]> => {
		const raw = await api.get<{ days?: { day?: string; plays?: number }[] }>(
			'/analytics/listening-by-day',
			{ params: { days } }
		);
		return (raw?.days ?? []).map(item => ({ day: String(item.day ?? ''), plays: number(item.plays) }));
	}
};
