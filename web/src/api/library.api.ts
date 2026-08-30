import { api } from "./client.api";
import type { Album, Artist } from "@/types";

export interface FeaturedItem {
   id: string;
   title: string;
   subtitle?: string;
   artworkUrl?: string;
   type: "playlist" | "album";
}

export const libraryApi = {
   getAlbums: () => api.get<Album[]>("/library/albums"),

   getAlbum: (id: string) => api.get<Album>(`/library/albums/${id}`),

   getArtists: () => api.get<Artist[]>("/library/artists"),

   getArtist: (id: string) => api.get<Artist>(`/library/artists/${id}`),

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
