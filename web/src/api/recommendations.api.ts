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
    try {
      const raw = await api.get<unknown>('/recommendations/home', {
        params: { force: String(force) },
      });
      if (!raw || typeof raw !== 'object') return { sections: [], updated_at: '' };
      const r = raw as Record<string, unknown>;
      return {
        sections: Array.isArray(r.sections)
          ? r.sections.map((s: unknown) => {
              if (!s || typeof s !== 'object') return null;
              const sec = s as Record<string, unknown>;
              return {
                section_id: String(sec.section_id ?? ''),
                title: String(sec.title ?? ''),
                track_ids: Array.isArray(sec.track_ids)
                  ? sec.track_ids.map(String)
                  : [],
                generated_at: String(sec.generated_at ?? ''),
              };
            }).filter(Boolean) as RecommendationSection[]
          : [],
        updated_at: String(r.updated_at ?? ''),
      };
    } catch {
      return { sections: [], updated_at: '' };
    }
  },

  getAutoplay: async (trackId: string, limit = 5): Promise<{ tracks: AutoplayCandidate[] }> => {
    return api.get('/recommendations/autoplay', {
      params: { track_id: trackId, limit: String(limit) },
    });
  },

  getDiscover: async (limit = 20): Promise<{ track_ids: string[] }> => {
    return api.get('/recommendations/discover', {
      params: { limit: String(limit) },
    });
  },

  getTaste: async (): Promise<TasteProfileInfo> => {
    return api.get<TasteProfileInfo>('/recommendations/taste');
  },

  refresh: async (): Promise<{ ok: boolean; sections: number }> => {
    return api.post('/recommendations/refresh');
  },
};
