import { api } from './client.api'

export interface ListeningStats {
  total_plays: number
  plays_7d: number
  plays_30d: number
  total_likes: number
  unique_artists_30d: number
  active_days_30d: number
  estimated_listening_hours: number
  current_streak: number
  longest_streak: number
}

export interface ArtistRank {
  artist: string
  plays: number
}

export interface TrackRank {
  track_id: string
  plays: number
}

export interface HourlyData {
  hour: number
  plays: number
}

export interface DailyData {
  day: string
  plays: number
}

export interface WrappedRankedArtist {
  artist: string
  plays: number
}

export interface WrappedRankedTrack {
  track_id: string
  title: string
  artist: string
  plays: number
}

export interface WrappedMonth {
  month: number // 1-12
  plays: number
}

export interface WrappedGenre {
  genre: string
  plays: number
}

export interface WrappedStreaks {
  current_streak: number
  longest_streak: number
}

export interface WrappedReport {
  year: number
  top_artists: WrappedRankedArtist[]
  top_tracks: WrappedRankedTrack[]
  total_plays: number
  total_minutes: number
  months: WrappedMonth[]
  genres: WrappedGenre[]
  streaks: WrappedStreaks
  top_decade: string | null
}

export const analyticsApi = {
  getStats: () =>
    api.get<ListeningStats>('/analytics/stats'),

  getTopArtists: (days = 30, limit = 10) =>
    api.get<{ artists: ArtistRank[] }>('/analytics/top-artists', {
      params: { days: String(days), limit: String(limit) }
    }),

  getTopTracks: (days = 30, limit = 10) =>
    api.get<{ tracks: TrackRank[] }>('/analytics/top-tracks', {
      params: { days: String(days), limit: String(limit) }
    }),

  getListeningByHour: (days = 30) =>
    api.get<{ hours: HourlyData[] }>('/analytics/listening-by-hour', {
      params: { days: String(days) }
    }),

  getListeningByDay: (days = 7) =>
    api.get<{ days: DailyData[] }>('/analytics/listening-by-day', {
      params: { days: String(days) }
    }),

  getWrapped: (year?: number) =>
    api.get<WrappedReport>('/analytics/wrapped', {
      params: year ? { year: String(year) } : {}
    }),
}
