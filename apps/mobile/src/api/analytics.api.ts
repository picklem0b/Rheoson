import { api } from './client';

export interface ListeningStats {
	/** Seconds listened, all time. */
	totalSeconds: number;
	/** Distinct tracks played. */
	trackCount: number;
	artistCount: number;
	/** Consecutive days with at least one play. */
	streakDays: number;
	topTracks: { id: string; title: string; artist?: string; plays: number }[];
	topArtists: { id: string; name: string; plays: number }[];
	byDay: { date: string; seconds: number }[];
	byHour: { hour: number; seconds: number }[];
}

export interface WrappedSummary {
	year: number;
	totalSeconds: number;
	topTracks: { id: string; title: string; artist?: string; plays: number }[];
	topArtists: { id: string; name: string; plays: number }[];
	topGenres?: { name: string; plays: number }[];
}

/** Listening history, in aggregate. */
export const analyticsApi = {
	stats: () => api.get<ListeningStats>('/analytics/stats'),
	wrapped: (year?: number) =>
		api.get<WrappedSummary>('/analytics/wrapped', year ? { params: { year } } : undefined)
};
