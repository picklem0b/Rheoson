import { describe, expect, it } from 'vitest'
import { matchRoutes } from 'react-router-dom'
import { guestVerdict } from '@/lib/authGate'
import { routes } from '@/router'

describe('guest gate', () => {
  it('lets guests search, stream and read public charts', () => {
    expect(guestVerdict('GET', '/search?q=queen')).toBe('allow')
    expect(guestVerdict('GET', '/stream/abc/audio')).toBe('allow')
    expect(guestVerdict('GET', '/tracks/trending')).toBe('allow')
    expect(guestVerdict('GET', '/tracks/abc123')).toBe('allow')
  })

  it('blocks account reads quietly instead of opening the card', () => {
    expect(guestVerdict('GET', '/tracks/liked')).toBe('read-blocked')
    expect(guestVerdict('GET', '/playlists')).toBe('read-blocked')
    expect(guestVerdict('GET', '/messages/conversations')).toBe('read-blocked')
  })

  it('prompts for account actions', () => {
    expect(guestVerdict('POST', '/tracks/abc/like')).toBe('prompt')
    expect(guestVerdict('POST', '/playlists')).toBe('prompt')
    expect(guestVerdict('POST', '/messages/send')).toBe('prompt')
  })

  it('drops play telemetry for guests without prompting', () => {
    expect(guestVerdict('POST', '/tracks/abc/play')).toBe('silent')
    expect(guestVerdict('POST', '/tracks/signals')).toBe('silent')
  })

  it('routes the OAuth callback outside the app shell', () => {
    const m = matchRoutes(routes, '/sso-callback')!
    expect(m[m.length - 1].route.path).toBe('/sso-callback')
  })
})
