import { useEffect } from 'react'
import { usePlayerStore } from '@/store/playerStore'
import { usePlayer } from './usePlayer'

export function useMediaSession() {
  const { currentTrack, isPlaying } = usePlayerStore()
  const { togglePlay, skipNext, skipPrev } = usePlayer()

  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return

    navigator.mediaSession.metadata = new MediaMetadata({
      title:  currentTrack.title,
      artist: currentTrack.artist.name,
      album:  currentTrack.album.title,
      artwork: [
        { src: currentTrack.artworkUrl, sizes: '512x512', type: 'image/jpeg' },
      ],
    })

    navigator.mediaSession.setActionHandler('play',         togglePlay)
    navigator.mediaSession.setActionHandler('pause',        togglePlay)
    navigator.mediaSession.setActionHandler('nexttrack',    skipNext)
    navigator.mediaSession.setActionHandler('previoustrack',skipPrev)

    return () => {
      navigator.mediaSession.setActionHandler('play',         null)
      navigator.mediaSession.setActionHandler('pause',        null)
      navigator.mediaSession.setActionHandler('nexttrack',    null)
      navigator.mediaSession.setActionHandler('previoustrack',null)
    }
  }, [currentTrack, togglePlay, skipNext, skipPrev])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
  }, [isPlaying])
}