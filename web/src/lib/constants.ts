const RENDER_API_URL = import.meta.env.VITE_API_URL ?? 'https://shulker-api.onrender.com'

const isProd = import.meta.env.PROD

export const API_BASE = isProd
  ? `${RENDER_API_URL}/api`
  : '/api'

export const WS_URL = isProd
  ? RENDER_API_URL
  : 'http://127.0.0.1:8000'

export const ENDPOINTS = {
  health:         `${API_BASE}/health`,
  search:         (q: string, filter?: string) =>
    `${API_BASE}/search?q=${encodeURIComponent(q)}${filter ? `&filter=${filter}` : ''}`,
  resolve:        `${API_BASE}/search/resolve`,
  tracks:         `${API_BASE}/tracks`,
  track:          (id: string) => `${API_BASE}/tracks/${id}`,
  stream:         (id: string) => `${API_BASE}/stream/${id}/audio`,
  artwork:        (id: string) => `${API_BASE}/stream/${id}/artwork`,
  like:           (id: string) => `${API_BASE}/tracks/${id}/like`,
  play:           (id: string) => `${API_BASE}/tracks/${id}/play`,
  liked:          `${API_BASE}/tracks/liked`,
  recentlyPlayed: `${API_BASE}/tracks/recently-played`,
  downloads:      `${API_BASE}/downloads`,
  download:       (id: string) => `${API_BASE}/downloads/${id}`,
  downloadCancel: (id: string) => `${API_BASE}/downloads/${id}/cancel`,
  downloadRetry:  (id: string) => `${API_BASE}/downloads/${id}/retry`,
  playlists:      `${API_BASE}/playlists`,
  playlist:       (id: string) => `${API_BASE}/playlists/${id}`,
  playlistTracks: (id: string) => `${API_BASE}/playlists/${id}/tracks`,
  importPlaylist: (id: string) => `${API_BASE}/playlists/${id}/import`,
  lyrics:         (id: string, title?: string, artist?: string) =>
    `${API_BASE}/lyrics/${id}?title=${encodeURIComponent(title || '')}&artist=${encodeURIComponent(artist || '')}`,
} as const

export const PLAYER_DEFAULTS = {
  volume:   0.8,
  seekStep: 10,
} as const

export const DOWNLOAD_DEFAULTS = {
  format:       'mp3'  as const,
  quality:      '320'  as const,
  embedArtwork: true,
  embedLyrics:  true,
} as const

export const BREAKPOINTS = {
  sm:  640,
  md:  768,
  lg:  1024,
  xl:  1280,
} as const

export const STORAGE_KEYS = {
  theme:  'shulker-theme',
  volume: 'shulker-volume',
  queue:  'shulker-queue',
  liked:  'shulker-liked',
  user:   'shulker-user',
} as const

export const APP_NAME    = 'Shulker'
export const APP_VERSION = '1.3.0-rc'
