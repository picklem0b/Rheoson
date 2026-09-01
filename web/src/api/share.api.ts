import { api } from './client.api'

export const shareApi = {
  getShareLink: (trackId: string, title?: string, artist?: string) => {
    const params: Record<string, string> = {}
    if (title) params.title = title
    if (artist) params.artist = artist
    return api.get<{ url: string; deeplink: string }>(
      `/share/${trackId}/link`,
      { params }
    )
  },

  getShareCardUrl: (trackId: string, title?: string, artist?: string, artwork?: string) => {
    const params = new URLSearchParams()
    if (title) params.set('title', title)
    if (artist) params.set('artist', artist)
    if (artwork) params.set('artwork', artwork)
    const qs = params.toString()
    return `/api/share/${trackId}/card${qs ? `?${qs}` : ''}`
  },
}
