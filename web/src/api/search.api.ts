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

// ── Smart (natural-language) search ───────────────────────────

export interface SmartSearchContext {
   track_id?: string;
   title?: string;
   artist?: string;
   /** Current route, e.g. "/library" — reserved for future intents. */
   page?: string;
}

export interface SmartSearchResult {
   intent: string;
   label: string;
   message: string;
   tracks: Track[];
   albums?: unknown[];
   artists?: unknown[];
   playlists?: unknown[];
   category?: CategoryMeta | null;
   week?: string | null;
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

   /**
    * Natural-language search with context about what the app is playing.
    * Powers "more like this", "top 5 hip-hop this week", "songs by X"…
    */
   smartSearch: async (
      query: string,
      context: SmartSearchContext = {},
      signal?: AbortSignal
   ): Promise<SmartSearchResult> => {
      const raw = await api.post<
         Omit<SmartSearchResult, "tracks"> & { tracks?: unknown[] }
      >("/search/smart", { query, context }, { signal });
      return {
         intent: raw?.intent ?? "search",
         label: raw?.label ?? "Results",
         message: raw?.message ?? "",
         tracks: normalizeTracks(raw?.tracks ?? []),
         albums: raw?.albums ?? [],
         artists: raw?.artists ?? [],
         playlists: raw?.playlists ?? [],
         category: raw?.category ?? null,
         week: raw?.week ?? null,
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
