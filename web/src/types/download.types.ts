export type DownloadStatus =
  | 'queued'
  | 'searching'
  | 'downloading'
  | 'converting'
  | 'tagging'
  | 'done'
  | 'error'
  | 'cancelled'

export type AudioFormat = 'mp3' | 'flac' | 'opus' | 'm4a' | 'wav'
export type AudioQuality = '128' | '192' | '256' | '320' | 'best'

export interface DownloadJob {
  id: string
  trackId: string
  title: string
  artist: string
  artworkUrl: string
  status: DownloadStatus
  progress: number        // 0–100
  format: AudioFormat
  quality: AudioQuality
  error?: string
  filePath?: string
  createdAt: string
}

export interface DownloadOptions {
  format: AudioFormat
  quality: AudioQuality
  embedArtwork: boolean
  embedLyrics: boolean
}