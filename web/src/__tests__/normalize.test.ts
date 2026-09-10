import { describe, expect, it } from 'vitest'
import { normalizeTracks, dedupeTracks, normalizeTrack } from '@/lib/normalize'
import type { Track } from '@/types/index'

const BASE: Track = {
   id: 'base-id',
   title: 'Never Gonna Give You Up',
   artist: { id: 'a1', name: 'Rick Astley', imageUrl: '', genres: [], followers: 0, monthlyListeners: 0, description: '', subscribers: '', topTracks: [], albums: [] },
   album: { id: '', title: '', artist: { id: '', name: '', imageUrl: '', genres: [], followers: 0, monthlyListeners: 0, description: '', subscribers: '', topTracks: [], albums: [] }, artworkUrl: '', releaseYear: 0, year: 0, trackCount: 0, tracks: [] },
   artworkUrl: '',
   duration: 212,
   streamUrl: '',
   filePath: '',
   isDownloaded: false,
   isLiked: false,
   youtubeId: '',
   spotifyId: '',
   addedAt: '',
   trackNumber: 0,
   playCount: 0,
}

function track(overrides: Partial<Track>): Track {
   return { ...BASE, ...overrides, id: overrides.id ?? BASE.id }
}

describe('dedupeTracks', () => {
   it('keeps a song once when it exists as both a remote and a local entry', () => {
      const remote = track({ id: 'dQw4w9WgXcQ', youtubeId: 'dQw4w9WgXcQ' })
      const local = track({
         id: '3e822a2a75f32475',
         youtubeId: 'dQw4w9WgXcQ',
         isDownloaded: true,
         streamUrl: '/api/stream/3e822a2a75f32475/audio',
      })
      const result = dedupeTracks([remote, local])
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('3e822a2a75f32475') // downloaded copy wins
      expect(result[0].isDownloaded).toBe(true)
   })

   it('keeps distinct tracks with no shared identity', () => {
      const a = track({ id: 'aaa111bbb22', youtubeId: 'aaa111bbb22' })
      const b = track({ id: 'ccc333ddd44', youtubeId: 'ccc333ddd44' })
      expect(dedupeTracks([a, b])).toHaveLength(2)
   })

   it('normalizeTracks dedupes mixed youtube-id lists', () => {
      const result = normalizeTracks([
         { id: 'dQw4w9WgXcQ', title: 'x', youtubeId: 'dQw4w9WgXcQ', isDownloaded: false },
         { id: '3e822a2a75f32475', title: 'x', youtubeId: 'dQw4w9WgXcQ', isDownloaded: true },
         { id: 'other11char', title: 'y', youtubeId: 'other11char' },
      ])
      expect(result).toHaveLength(2)
   })
})

describe('normalizeTrack', () => {
   it('handles a missing album and artist gracefully', () => {
      const t = normalizeTrack({ id: 'x', title: 'T' })
      expect(t.artist.name).toBe('Unknown Artist')
      expect(t.album.title).toBe('Unknown Album')
      expect(t.duration).toBe(0)
   })

   it('parses string durations', () => {
      expect(normalizeTrack({ id: 'x', duration: '3:45' }).duration).toBe(225)
      expect(normalizeTrack({ id: 'x', duration: '1:02:03' }).duration).toBe(3723)
   })
})