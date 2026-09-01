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

   getArtist: async (id: string): Promise<Artist> => {
      const raw = await api.get<unknown>(`/library/artists/${id}`);
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
      })
};

export const { getAlbums, getAlbum, getArtists, getArtist, getFeatured } =
   libraryApi;
