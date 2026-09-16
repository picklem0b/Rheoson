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

// ── Categories ────────────────────────────────────────────────

export interface CategoryMeta {
   slug: string;
   label: string;
   emoji: string;
   gradient: string;
}


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
      api.post<ResolveResult>("/search/resolve", { url }, { signal }),

   /** Category tiles (backend-owned so they can't drift from the API). */
   getCategories: async (): Promise<{ week: string; categories: CategoryMeta[] }> => {
      const raw = await api.get<{ week?: string; categories?: CategoryMeta[] }>(
         "/search/categories"
      );
      return {
         week: raw?.week ?? "",
         categories: Array.isArray(raw?.categories) ? raw.categories : [],
      };
   },

   /** Top tracks for one category, refreshed weekly and cached server-side. */
   getCategoryTop: async (
      slug: string,
      limit = 5
   ): Promise<{ week: string; category: CategoryMeta | null; tracks: Track[] }> => {
      const raw = await api.get<{
         week?: string;
         category?: CategoryMeta;
         tracks?: unknown[];
      }>(`/search/categories/${encodeURIComponent(slug)}/top`, {
         params: { limit },
      });
      return {
         week: raw?.week ?? "",
         category: raw?.category ?? null,
         tracks: normalizeTracks(raw?.tracks ?? []),
      };
   },
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
