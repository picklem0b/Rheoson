export const API_BASE = '/api'
export const WS_URL = 'ws://localhost:8000'

export const ENDPOINTS = {
  // Search
  search:          (q: string) => `${API_BASE}/search?q=${encodeURIComponent(q)}`,
  searchYT:        (q: string) => `${API_BASE}/search/youtube?q=${encodeURIComponent(q)}`,

  // Tracks
  track:           (id: string) => `${API_BASE}/tracks/${id}`,
  stream:          (id: string) => `${API_BASE}/stream/${id}`,
  like:            (id: string) => `${API_BASE}/tracks/${id}/like`,

  // Downloads
  download:        `${API_BASE}/downloads`,
  downloadStatus:  (id: string) => `${API_BASE}/downloads/${id}`,
  downloadCancel:  (id: string) => `${API_BASE}/downloads/${id}/cancel`,
  downloadRetry:   (id: string) => `${API_BASE}/downloads/${id}/retry`,

  // Playlists
  playlists:       `${API_BASE}/playlists`,
  playlist:        (id: string) => `${API_BASE}/playlists/${id}`,
  playlistTracks:  (id: string) => `${API_BASE}/playlists/${id}/tracks`,

  // Lyrics
  lyrics:          (id: string) => `${API_BASE}/lyrics/${id}`,
} as const

export const PLAYER_DEFAULTS = {
  volume:   0.8,
  seekStep: 10,    // seconds
} as const

export const DOWNLOAD_DEFAULTS = {
  format:        'mp3'  as const,
  quality:       '320'  as const,
  embedArtwork:  true,
  embedLyrics:   true,
} as const

export const BREAKPOINTS = {
  sm:  640,
  md:  768,
  lg:  1024,
  xl:  1280,
} as const

export const STORAGE_KEYS = {
  theme:    'shulker-theme',
  volume:   'shulker-volume',
  queue:    'shulker-queue',
  liked:    'shulker-liked',
} as const

export const APP_NAME = 'Shulker'
export const APP_VERSION = '1.0.0-alpha'