import { api } from './client.api';
import { normalizeTrack, normalizeTracks } from '@/lib/normalize';
import type { Track } from '@/types/index';

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

export interface TasteTrack {
  track_id: string;
  title: string;
  artist: string;
  plays: number;
}

export interface TastePersona {
  id: string;
  label: string;
  emoji: string;
  description: string;
}

export interface TasteProfileInfo {
  total_plays: number;
  total_likes: number;
  total_skips: number;
  avg_completion_rate: number;
  top_artists: { artist: string; score: number; plays: number }[];
  top_genres: { genre: string; score: number; plays: number }[];
  top_tracks: TasteTrack[];
  persona: TastePersona | null;
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
    const raw = await api.get<Record<string, unknown>>('/recommendations/taste');
    const list = (v: unknown) => (Array.isArray(v) ? v : []);
    const person = (v: unknown): TastePersona | null =>
      v && typeof v === 'object'
        ? {
            id: String((v as Record<string, unknown>).id ?? ''),
            label: String((v as Record<string, unknown>).label ?? ''),
            emoji: String((v as Record<string, unknown>).emoji ?? ''),
            description: String((v as Record<string, unknown>).description ?? ''),
          }
        : null;
    return {
      total_plays: Number(raw.total_plays ?? 0),
      total_likes: Number(raw.total_likes ?? 0),
      total_skips: Number(raw.total_skips ?? 0),
      avg_completion_rate: Number(raw.avg_completion_rate ?? 0),
      top_artists: list(raw.top_artists).map((a) => ({
        artist: String((a as Record<string, unknown>).artist ?? ''),
        score: Number((a as Record<string, unknown>).score ?? 0),
        plays: Number((a as Record<string, unknown>).plays ?? 0),
      })),
      top_genres: list(raw.top_genres).map((g) => ({
        genre: String((g as Record<string, unknown>).genre ?? ''),
        score: Number((g as Record<string, unknown>).score ?? 0),
        plays: Number((g as Record<string, unknown>).plays ?? 0),
      })),
      top_tracks: list(raw.top_tracks).map((t) => ({
        track_id: String((t as Record<string, unknown>).track_id ?? ''),
        title: String((t as Record<string, unknown>).title ?? ''),
        artist: String((t as Record<string, unknown>).artist ?? ''),
        plays: Number((t as Record<string, unknown>).plays ?? 0),
      })),
      persona: person(raw.persona),
      cold_start: Boolean(raw.cold_start),
      last_updated: String(raw.last_updated ?? ''),
    };
  },

  refresh: async (): Promise<{ ok: boolean; sections: number }> => {
    return api.post('/recommendations/refresh');
  },

  getMixes: async (): Promise<DailyMix[]> => {
    try {
      const raw = await api.get<unknown>('/recommendations/mixes');
      if (!raw || typeof raw !== 'object') return [];
      const mixes = (raw as Record<string, unknown>).mixes;
      if (!Array.isArray(mixes)) return [];
      return mixes
        .map((m) => {
          if (!m || typeof m !== 'object') return null;
          const mix = m as Record<string, unknown>;
          const tracks = Array.isArray(mix.tracks)
            ? (mix.tracks as unknown[]).map(normalizeTrack)
            : [];
          if (!tracks.length) return null;
          return {
            id: String(mix.id ?? ''),
            title: String(mix.title ?? 'Daily Mix'),
            subtitle: String(mix.subtitle ?? ''),
            artworkUrl: String(mix.artworkUrl ?? tracks[0].artworkUrl ?? ''),
            tracks,
          };
        })
        .filter(Boolean) as DailyMix[];
    } catch {
      return [];
    }
  },

  getRadio: async (trackId: string, limit = 20): Promise<{ seed: unknown; tracks: Track[] }> => {
    try {
      const raw = await api.get<Record<string, unknown>>('/recommendations/radio', {
        params: { track_id: trackId, limit: String(limit) },
      });
      const tracks = Array.isArray(raw?.tracks) ? normalizeTracks(raw.tracks) : [];
      return { seed: raw?.seed ?? null, tracks };
    } catch {
      return { seed: null, tracks: [] };
    }
  },
};

export interface DailyMix {
  id: string;
  title: string;
  subtitle: string;
  artworkUrl: string;
  tracks: Track[];
}
