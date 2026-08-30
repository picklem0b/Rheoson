import { api } from './client.api';

export interface RecommendationSection {
  section_id: string;
  title: string;
  track_ids: string[];
  generated_at: string;
}

export interface HomeRecommendations {
  sections: RecommendationSection[];
  updated_at: string;
}

export interface AutoplayCandidate {
  track_id: string;
  title: string;
  artist: string;
  score: number;
}

export interface TasteProfileInfo {
  total_plays: number;
  total_likes: number;
  total_skips: number;
  avg_completion_rate: number;
  top_artists: { artist: string; score: number; plays: number }[];
  top_genres: { genre: string; score: number; plays: number }[];
  cold_start: boolean;
  last_updated: string;
}

export const recommendationsApi = {
  getHome: async (force = false): Promise<HomeRecommendations> => {
    return api.get<HomeRecommendations>('/api/recommendations/home', {
      params: { force: String(force) },
    });
  },

  getAutoplay: async (trackId: string, limit = 5): Promise<{ tracks: AutoplayCandidate[] }> => {
    return api.get('/api/recommendations/autoplay', {
      params: { track_id: trackId, limit: String(limit) },
    });
  },

  getDiscover: async (limit = 20): Promise<{ track_ids: string[] }> => {
    return api.get('/api/recommendations/discover', {
      params: { limit: String(limit) },
    });
  },

  getTaste: async (): Promise<TasteProfileInfo> => {
    return api.get<TasteProfileInfo>('/api/recommendations/taste');
  },

  refresh: async (): Promise<{ ok: boolean; sections: number }> => {
    return api.post('/api/recommendations/refresh');
  },
};
