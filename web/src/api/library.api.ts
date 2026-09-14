import { api } from "./client.api";
import { normalizeAlbum, normalizeArtist } from "@/lib/normalize";
import type { Album, Artist } from "@/types";

export interface FeaturedItem {
   id: string;
   title: string;
   subtitle?: string;
   artworkUrl?: string;
   type: "playlist" | "album";
}

export interface ArtistRelease {
   id: string;
   title: string;
   artworkUrl: string;
   releaseYear: number;
   type: 'album' | 'single';
}

export interface FollowedArtist {
   id: string;
   name: string;
   imageUrl: string;
   monthlyListeners: number;
   latestRelease: ArtistRelease | null;
   followedAt: string;
   updatedAt: string;
}

export interface FollowStatus {
   isFollowing: boolean;
   latestRelease: ArtistRelease | null;
   isNewRelease: boolean;
}

export const libraryApi = {
   getAlbums: async (): Promise<Album[]> => {
      const raw = await api.get<unknown[]>("/library/albums");
      return Array.isArray(raw) ? raw.map(normalizeAlbum) : [];
   },

   getAlbum: async (id: string): Promise<Album> => {
      const raw = await api.get<unknown>(`/library/albums/${id}`);
      return normalizeAlbum(raw);
   },

   getArtists: async (): Promise<Artist[]> => {
      const raw = await api.get<unknown[]>("/library/artists");
      return Array.isArray(raw) ? raw.map(normalizeArtist) : [];
   },

   /**
    * Full artist profile + top songs. Hits /api/artists/{id} which
    * browses YouTube Music for remote artists and falls back to the
    * local library aggregate for downloaded-only artists.
    */
   getArtist: async (id: string): Promise<Artist> => {
      const raw = await api.get<unknown>(`/artists/${id}`);
      return normalizeArtist(raw);
   },

   /**
    * Featured items for the Home page.
    * limit must be a plain number — passing an object here caused the
    * URL to contain "limit=%5Bobject+Object%5D" which returned 404.
    */
   getFeatured: (limit: number = 10) =>
      api.get<FeaturedItem[]>("/library/featured", {
         params: { limit }
      }),

   // ── Artist follows ────────────────────────────────────────
   // Follows live server-side (per user), so they survive a reinstall and
   // can drive release notifications + recommendations.

   getFollowing: async (): Promise<FollowedArtist[]> => {
      const raw = await api.get<{ artists?: FollowedArtist[] }>(
         "/artists/following"
      );
      return Array.isArray(raw?.artists) ? raw.artists : [];
   },

   getFollowStatus: (artistId: string): Promise<FollowStatus> =>
      api.get<FollowStatus>(`/artists/${artistId}/status`),

   followArtist: (
      artistId: string,
      meta: { name?: string; imageUrl?: string; monthlyListeners?: number } = {}
   ) =>
      api.post<{ isFollowing: boolean; artist: FollowedArtist }>(
         `/artists/${artistId}/follow`,
         meta
      ),

   unfollowArtist: (artistId: string) =>
      api.delete<{ isFollowing: boolean }>(`/artists/${artistId}/follow`),

   /** Stop treating the artist's latest release as "new". */
   markReleaseSeen: (artistId: string) =>
      api.post<{ ok: boolean }>(`/artists/${artistId}/seen`)
};

export const {
   getAlbums,
   getAlbum,
   getArtists,
   getArtist,
   getFeatured,
   getFollowing,
   getFollowStatus,
   followArtist,
   unfollowArtist,
   markReleaseSeen
} = libraryApi;
