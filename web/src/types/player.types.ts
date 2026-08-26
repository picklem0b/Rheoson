export type RepeatMode = 'off' | 'all' | 'one'

export interface PlayerState {
  isPlaying: boolean
  volume: number          // 0–1
  isMuted: boolean
  progress: number        // seconds
  duration: number        // seconds
  repeatMode: RepeatMode
  isShuffled: boolean
  isLoading: boolean
  showQueue: boolean
  showLyrics: boolean
  showFullscreen: boolean
}