import { z } from 'zod'
import { timestampSchema } from './primitives'
import { providerSchema, trackSummarySchema } from './track'

/**
 * Catalogue contracts: a search and the ticket that makes one track playable.
 *
 * A stream ticket is never stored. Provider URLs are signed and expire in
 * minutes, so the client asks for one at play time and keeps only the provider
 * id in anything that persists.
 */

export const SEARCH_LIMIT_MAX = 50

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'expected a search term').max(120),
  limit: z.coerce.number().int().min(1).max(SEARCH_LIMIT_MAX).default(25),
})

export type SearchQuery = z.infer<typeof searchQuerySchema>

export const searchResultsSchema = z.object({
  items: z.array(trackSummarySchema),
})

export type SearchResults = z.infer<typeof searchResultsSchema>

export const streamParamsSchema = z.object({
  provider: providerSchema,
  providerTrackId: z.string().trim().min(1).max(64),
})

export type StreamParams = z.infer<typeof streamParamsSchema>

export const streamTicketSchema = z.object({
  url: z.url(),
  mime: z.string().min(1),
  /** When the signature dies. Null when the provider does not say. */
  expiresAt: timestampSchema.nullable(),
})

export type StreamTicket = z.infer<typeof streamTicketSchema>
