/**
 * Local search suggestions — no API, no network, no latency.
 *
 * Sources, in priority order:
 *   1. The user's own search history (their queries, plus the artists and
 *      titles of songs they actually played from those searches).
 *   2. A small curated seed of popular artists/genres so the dropdown is
 *      never empty for a fresh install.
 *
 * Matching is prefix-first, then substring. Everything is synchronous
 * string work — a keystroke to dropdown is well under a millisecond.
 */
import { readHistory } from '@/hooks/useSearchHistory'

/** Popular seeds so a fresh install still gets a useful dropdown. */
const SEEDS = [
   'Daft Punk', 'Kendrick Lamar', 'Drake', 'Taylor Swift', 'The Weeknd',
   'Travis Scott', 'Beyoncé', 'Rihanna', 'Amapiano', 'Hip hop',
   'Amapiano 2026', 'Lo-fi beats', 'Afrobeats', 'Jazz', 'House',
   'Kabza De Small', 'Kanye West', 'Frank Ocean', 'Tyler, The Creator',
   'SZA', 'Doja Cat', 'Metro Boomin', 'Cassper Nyovest', 'Nasty C',
]

export function localSuggest(query: string, limit = 6): string[] {
   const q = query.trim().toLowerCase()
   if (q.length < 2) return []

   const candidates: string[] = []
   const seen = new Set<string>()
   const push = (s: string) => {
      const t = s.trim()
      if (t && !seen.has(t.toLowerCase())) {
         seen.add(t.toLowerCase())
         candidates.push(t)
      }
   }

   // 1. History-derived candidates (most recently used first).
   for (const entry of readHistory()) {
      push(entry.query)
      if (entry.track?.artistName) push(entry.track.artistName)
      if (entry.track?.title) push(entry.track.title)
   }

   // 2. Curated seeds.
   for (const s of SEEDS) push(s)

   const starts: string[] = []
   const contains: string[] = []
   for (const c of candidates) {
      const lc = c.toLowerCase()
      if (lc.startsWith(q)) starts.push(c)
      else if (lc.includes(q)) contains.push(c)
   }
   return [...starts, ...contains].slice(0, limit)
}
