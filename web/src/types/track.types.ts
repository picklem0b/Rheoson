export interface Artist {
  id: string
  name: string
  imageUrl?: string
  genres?: string[]
  followers?: number
}

export interface Album {
  id: string
  title: string
  artist: Artist
  artworkUrl: string
  releaseYear: number
  trackCount: number
  tracks?: Track[]
}

export interface Track {
  id: string
  title: string
  artist: Artist
  album: Album
  artworkUrl: string
  duration: number        // seconds
  streamUrl?: string      // local stream endpoint
  filePath?: string       // local file path if downloaded
  isDownloaded: boolean
  isLiked: boolean
  youtubeId?: string
  spotifyId?: string
  addedAt?: string
}