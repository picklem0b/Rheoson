import { z } from 'zod'

/**
 * Track identity.
 *
 * One rule governs this file: **two recordings are the same track only when an
 * identifier says so.** ISRC or MusicBrainz id. Never a title, never a title
 * plus an artist, never a fuzzy duration match. A track that exists twice under
 * two identifiers means every list in the app needs de-duplication logic to hide
 * it, and that logic is never quite right.
 *
 * `syntheticTrackId` exists only so a provider result that has not been stored
 * yet still keeps one id across a search, a reload and a queue. It is a
 * placeholder, never a merge key.
 */

export const PROVIDERS = ['audius', 'jamendo', 'soundcloud', 'deezer', 'itunes', 'local'] as const
export const providerSchema = z.enum(PROVIDERS)
export type Provider = z.infer<typeof providerSchema>

const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/

/** Internal id, ULID-prefixed so it is recognisable in a log and time-sortable. */
export const trackIdSchema = z
  .string()
  .refine((value) => value.startsWith('trk_') && ULID_PATTERN.test(value.slice(4)), {
    message: 'expected trk_ followed by a ULID',
  })
  .brand<'TrackId'>()

export type TrackId = z.infer<typeof trackIdSchema>

const ISRC_PATTERN = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/

/** ISRC with separators removed and case folded, as the registry stores it. */
function normalizeIsrc(input: string): string {
  return input.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

export const isrcSchema = z
  .string()
  .transform(normalizeIsrc)
  .refine((value) => ISRC_PATTERN.test(value), { message: 'invalid ISRC' })

/** A track as the API and the client both see it. */
export const trackSummarySchema = z.object({
  id: trackIdSchema,
  title: z.string().min(1),
  artistName: z.string().min(1),
  albumName: z.string().nullable(),
  artworkUrl: z.url().nullable(),
  durationMs: z.number().int().nonnegative(),
  provider: providerSchema,
  /** The provider's own id, which is what a stream request needs. */
  providerTrackId: z.string().min(1).nullable().default(null),
  isrc: isrcSchema.nullable().default(null),
})

export type TrackSummary = z.infer<typeof trackSummarySchema>

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/**
 * A provisional id for a provider result that has not been stored yet.
 *
 * Deterministic, so the same Audius track keeps the same id across a search, a
 * reload and a queue, which is what stops React and the player from treating one
 * song as two. Once M1 stores tracks, the row's ULID wins.
 */
export function syntheticTrackId(provider: Provider, providerId: string): TrackId {
  const seed = `${provider}:${providerId}`
  let hash = 0x811c9dc5

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }

  let body = ''
  let state = hash || 0x9e3779b9

  while (body.length < 26) {
    state = Math.imul(state ^ (state >>> 13), 0x5bd1e995) >>> 0
    body += CROCKFORD[state % 32]
  }

  return trackIdSchema.parse(`trk_${body.slice(0, 26)}`)
}
