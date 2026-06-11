import { api } from './client'

export interface LyricsLine {
  /** Timestamp in milliseconds from track start. */
  time: number
  text: string
}

export interface LyricsResponse {
  trackId: string
  synced:  boolean
  lines:   LyricsLine[]
  source:  string
}

export const lyricsApi = {
  getLyrics: (trackId: string, signal?: AbortSignal) =>
    api.get<LyricsResponse>(`/lyrics/${trackId}`, { signal }),
}
