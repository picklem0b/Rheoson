import { api } from './client'

export interface LyricsLine {
  time: number   // milliseconds from track start
  text: string
}

export interface LyricsResponse {
  trackId: string
  synced:  boolean
  lines:   LyricsLine[]
  source:  string
}

export const lyricsApi = {
  /**
   * Fetch lyrics for a track.
   * Pass title and artist when available — the backend lyrics service
   * uses these to search Musixmatch/Lrclib/Genius rather than the raw
   * YouTube video ID (which returns nothing on most providers).
   */
  getLyrics: (
    trackId:  string,
    title?:   string,
    artist?:  string,
    signal?:  AbortSignal,
  ) => {
    const params: Record<string, string> = {}
    if (title)  params.title  = title
    if (artist) params.artist = artist
    return api.get<LyricsResponse>(`/lyrics/${trackId}`, { params, signal })
  },
}