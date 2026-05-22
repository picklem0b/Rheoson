import { api } from './client'

export interface LyricsLine {
  time:  number   // milliseconds
  text:  string
}

export interface LyricsResponse {
  trackId:  string
  synced:   boolean
  lines:    LyricsLine[]
  source:   string
}

export const lyricsApi = {
  getLyrics: (trackId: string) =>
    api.get<LyricsResponse>(`/lyrics/${trackId}`),
}