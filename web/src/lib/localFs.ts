/**
 * Local filesystem scanner — reads music files directly from the device
 * using Capacitor Filesystem. Bypasses the backend entirely for local files.
 *
 * On Android (Termux), music is at: MUSIC_DIR = /data/data/com.termux/files/home/Rheoson/music
 * From the Capacitor WebView, we use Filesystem.readDirectory() + Filesystem.readFile().
 *
 * In the browser (not Capacitor), this falls back to returning an empty array —
 * the backend API handles file scanning in that case.
 */

import type { Track } from '@/types/track.types';
import { isNativePlatform } from './capacitor';

// ── Audio file extensions ──────────────────────────────────────

const AUDIO_EXTENSIONS = new Set(['mp3', 'flac', 'm4a', 'ogg', 'opus', 'wav', 'aac', 'wma']);

function isAudioFile(filename: string): boolean {
   const ext = filename.split('.').pop()?.toLowerCase();
   return ext != null && AUDIO_EXTENSIONS.has(ext);
}

// ── Path helpers ───────────────────────────────────────────────

/**
 * Get the default music directory path.
 * On Termux: /data/data/com.termux/files/home/Rheoson/music
 * On regular Android: external storage Music/Rheoson
 */
function getMusicDirPath(): string {
   if (typeof window !== 'undefined') {
      // @ts-expect-error — Termux detection via environment
      if (window.__TERMUX__ || navigator.userAgent.includes('Termux')) {
         return '/data/data/com.termux/files/home/Rheoson/music';
      }
   }
   // Capacitor external filesystem
   return 'Music/Rheoson';
}

// ── Capacitor Filesystem scanner ───────────────────────────────

async function _readDirRecursive(dirPath: string): Promise<string[]> {
   const { Filesystem, Directory } = await import(/* @vite-ignore */ '@capacitor/filesystem');
   const files: string[] = [];

   try {
      const result = await Filesystem.readdir({
         path: dirPath,
         directory: Directory.External,
      });

      for (const entry of result.files) {
         if (entry.type === 'directory') {
            const subFiles = await _readDirRecursive(`${dirPath}/${entry.name}`);
            files.push(...subFiles);
         } else if (isAudioFile(entry.name)) {
            files.push(`${dirPath}/${entry.name}`);
         }
      }
   } catch {
      // Directory doesn't exist or permission denied
   }

   return files;
}

function _extractMetadataFromPath(filePath: string): Partial<Track> {
   // Parse artist/track from file path: .../Music/Rheoson/Artist/Track.mp3
   const parts = filePath.split('/');
   const filename = parts[parts.length - 1];
   const artistDir = parts.length >= 2 ? parts[parts.length - 2] : 'Unknown Artist';

   // Remove extension from filename
   const title = filename.replace(/\.[^.]+$/, '');

   return {
      title,
      artist: {
         id: artistDir.toLowerCase().replace(/\s+/g, '-'),
         name: artistDir,
      },
      isDownloaded: true,
      filePath,
   };
}

/**
 * Generate a stable track ID from a file path.
 * This matches the backend's _file_id(): MD5(str(path))[:16]
 * but since we can't do MD5 in the browser, we use a simpler
 * hash that's still unique for our purposes.
 */
export function filePathToId(filePath: string): string {
   let hash = 0;
   for (let i = 0; i < filePath.length; i++) {
      const char = filePath.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
   }
   return Math.abs(hash).toString(16).padStart(8, '0');
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Scan the local filesystem for music files.
 * Returns Track objects with basic metadata extracted from the file path.
 *
 * Returns empty array if not running on native platform.
 */
export async function scanLocalMusic(): Promise<Track[]> {
   if (!isNativePlatform()) {
      return [];
   }

   try {
      const musicDir = getMusicDirPath();
      const filePaths = await _readDirRecursive(musicDir);

      return filePaths.map((path) => {
         const id = filePathToId(path);
         const meta = _extractMetadataFromPath(path);

         return {
            id,
            title: meta.title ?? 'Unknown',
            artist: meta.artist ?? { id: 'unknown', name: 'Unknown Artist' },
            album: {
               id: 'local-album',
               title: 'Local',
               artist: meta.artist ?? { id: 'unknown', name: 'Unknown Artist' },
               artworkUrl: '',
               releaseYear: 0,
               trackCount: 0,
            },
            artworkUrl: '',
            duration: 0, // unknown until played
            isDownloaded: true,
            isLiked: false,
            filePath: meta.filePath,
            streamUrl: `/api/stream/${id}/audio`,
         } satisfies Track;
      });
   } catch (err) {
      console.warn('[Rheoson] Failed to scan local music:', err);
      return [];
   }
}

/**
 * Get the direct file:// URL for a local track.
 * Used by the player to bypass the backend stream endpoint.
 */
export async function getLocalFileUrl(filePath: string): Promise<string | null> {
   if (!isNativePlatform() || !filePath) return null;

   try {
      const { Filesystem, Directory } = await import(/* @vite-ignore */ '@capacitor/filesystem');

      // Get the file URI from Capacitor
      const result = await Filesystem.getUri({
         path: filePath,
         directory: Directory.External,
      });

      return result.uri;
   } catch {
      return null;
   }
}

/**
 * Check if a file exists at the given path.
 */
export async function fileExists(filePath: string): Promise<boolean> {
   if (!isNativePlatform()) return false;

   try {
      const { Filesystem, Directory } = await import(/* @vite-ignore */ '@capacitor/filesystem');
      await Filesystem.stat({ path: filePath, directory: Directory.External });
      return true;
   } catch {
      return false;
   }
}
