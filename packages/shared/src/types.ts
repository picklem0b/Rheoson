/**
 * Core domain types — the identity and shape contracts.
 *
 * Track identity follows the production rule (CLAUDE.md): downloaded tracks
 * keep their videoId identity; `normalize.ts` output is the canonical key.
 * The engine's MD5 `_file_id()` remains the *file* identity inside the
 * engine only — it never leaks into client or server types.
 */

export interface ArtistRef {
  id: string;
  name: string;
  imageUrl?: string;
}

export interface Track {
  /** Canonical identity: videoId (or normalized local id). */
  id: string;
  title: string;
  artist?: ArtistRef;
  album?: { id: string; title: string };
  artworkUrl?: string;
  duration?: number;
  videoId?: string;
  isDownloaded?: boolean;
  isLiked?: boolean;
}

export interface Playlist {
  id: string;
  title: string;
  trackIds: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Blend {
  id: string;
  name: string;
  owner: string;
  members: string[];
  trackIds: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  kind: 'text' | 'track' | 'lyrics' | 'playlist' | 'album' | 'artist' | 'blend';
  text: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface PresenceUser {
  userId: string;
  username: string;
  imageUrl: string;
  /** "{title} — {artist}" while playing, else null */
  listeningTo: string | null;
  isPlaying: boolean;
  /** Resolvable track id when listeningTo is set — makes the chip tappable. */
  trackId: string | null;
}

/** Standard error body every API failure carries. */
export interface ApiErrorBody {
  detail: string;
  code?: string;
}
