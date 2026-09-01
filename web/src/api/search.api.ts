import { api } from "./client.api";
import { normalizeSearchResults, normalizeTracks } from "@/lib/normalize";
import type { SearchResults, SearchFilter } from "@/types/search.types";
import type { Track } from "@/types/track.types";

// ── Resolve response ──────────────────────────────────────────
// The /search/resolve endpoint returns different shapes depending on what
// was passed (track URL → single track, album/playlist URL → collection).

export type ResolveResult =
   | { type: "track"; track: Track }
   | { type: "album"; tracks: Track[]; title: string }
   | { type: "playlist"; tracks: Track[]; title: string }
   | { type: "tracks"; tracks: Track[] };

// ── API ───────────────────────────────────────────────────────

export const searchApi = {
   search: async (
      query: string,
      filter?: Exclude<SearchFilter, "all">,
      signal?: AbortSignal
   ): Promise<SearchResults> => {
      const raw = await api.get<unknown>("/search", {
         params: { q: query, ...(filter ? { filter } : {}) },
         signal
      });
      return normalizeSearchResults(raw);
   },

   getSuggestions: (query: string, signal?: AbortSignal): Promise<string[]> =>
      api.get<string[]>("/search/suggest", {
         params: { q: query },
         signal
      }),

   resolve: (url: string, signal?: AbortSignal) =>
      api.post<ResolveResult>("/search/resolve", { url }, { signal })
};

// ── Normalise resolve result → Track[] ────────────────────────
// Centralises the "what shape did we get back?" logic so useSearch
// doesn't need to handle it with `any` casts.

export function resolveToTracks(result: ResolveResult): Track[] {
   switch (result.type) {
      case "track":
         return result.track ? [normalizeTracks([result.track])[0]] : [];
      case "album":
      case "playlist":
      case "tracks":
         return normalizeTracks(result.tracks ?? []);
   }
}
