import { env } from '../env.js';
import { badRequest } from '../errors.js';
import { engineJson } from './engine.service.js';

/**
 * Download jobs — the server's half.
 *
 * The queue lives in the engine because that is where ``yt-dlp`` and
 * ``ffmpeg`` are. The server's job is the part only the server can do:
 * **attaching an owner**. The client names a track; the owner comes from the
 * verified session, is sent as a header, and is then applied on every read and
 * every mutation. A job with no owner stays visible on purpose — a job created
 * before the field existed must not become unreachable.
 */

export interface DownloadJob {
  id: string;
  owner: string;
  target: string;
  trackId: string | null;
  url: string | null;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  speed: number | null;
  eta: number | null;
  totalBytes: number | null;
  downloadedBytes: number;
  title: string;
  artist: string;
  album: string;
  filename: string;
  error: string | null;
  errorCode: string | null;
  attempts: number;
  resumable: boolean;
  stagedBytes: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The engine speaks snake_case; the client contract is camelCase. */
interface EngineJob {
  id: string;
  owner: string;
  target: string;
  track_id?: string | null;
  url?: string | null;
  status: DownloadJob['status'];
  progress: number;
  speed: number | null;
  eta: number | null;
  total_bytes?: number | null;
  downloaded_bytes?: number;
  title: string;
  artist: string;
  album: string;
  filename: string;
  error?: string | null;
  error_code?: string | null;
  attempts: number;
  resumable: boolean;
  stagedBytes: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

/** One place where the wire shape is translated, so it cannot drift. */
export function shapeJob(job: EngineJob): DownloadJob {
  return {
    id: job.id,
    owner: job.owner,
    target: job.target,
    trackId: job.track_id ?? null,
    url: job.url ?? null,
    status: job.status,
    progress: job.progress,
    speed: job.speed,
    eta: job.eta,
    totalBytes: job.total_bytes ?? null,
    downloadedBytes: job.downloaded_bytes ?? 0,
    title: job.title,
    artist: job.artist,
    album: job.album,
    filename: job.filename,
    error: job.error ?? null,
    errorCode: job.error_code ?? null,
    attempts: job.attempts,
    resumable: Boolean(job.resumable),
    stagedBytes: job.stagedBytes ?? 0,
    active: Boolean(job.active),
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  };
}

const MAX_TITLE_LEN = 200;

export async function listDownloads(owner: string): Promise<DownloadJob[]> {
  const body = await engineJson<{ jobs: EngineJob[] }>(`/downloads?owner=${encodeURIComponent(owner)}`, {
    owner,
    unavailable: 'DEN02',
    fallback: 'DEN02',
  });
  return (body.jobs ?? []).map(shapeJob);
}

export async function getDownload(owner: string, jobId: string): Promise<DownloadJob> {
  const job = await engineJson<EngineJob>(
    `/downloads/${encodeURIComponent(jobId)}?owner=${encodeURIComponent(owner)}`,
    { owner, unavailable: 'DEN02', fallback: 'DNF01' },
  );
  return shapeJob(job);
}

export async function createDownload(
  owner: string,
  input: { trackId?: string; url?: string; title?: string },
): Promise<DownloadJob> {
  if (!input.trackId && !input.url) throw badRequest('DVA03');

  const job = await engineJson<EngineJob>('/downloads', {
    method: 'POST',
    owner,
    body: {
      trackId: input.trackId,
      url: input.url,
      title: (input.title ?? '').slice(0, MAX_TITLE_LEN),
    },
    unavailable: 'DEN02',
    fallback: 'DEX01',
  });
  return shapeJob(job);
}

export async function cancelDownload(owner: string, jobId: string): Promise<DownloadJob> {
  const job = await engineJson<EngineJob>(
    `/downloads/${encodeURIComponent(jobId)}/cancel?owner=${encodeURIComponent(owner)}`,
    { method: 'POST', owner, unavailable: 'DEN02', fallback: 'DNF01' },
  );
  return shapeJob(job);
}

/**
 * Retry a job. ``resume`` is tri-state on purpose:
 * `undefined` means "continue if there is something to continue from", which
 * is the honest default — the staged bytes exist to be reused.
 */
export async function retryDownload(owner: string, jobId: string, resume?: boolean): Promise<DownloadJob> {
  const job = await engineJson<EngineJob>(
    `/downloads/${encodeURIComponent(jobId)}/retry?owner=${encodeURIComponent(owner)}`,
    {
      method: 'POST',
      owner,
      body: resume === undefined ? {} : { resume },
      unavailable: 'DEN02',
      fallback: 'DNF01',
    },
  );
  return shapeJob(job);
}

export async function deleteDownload(owner: string, jobId: string): Promise<{ id: string; deleted: true; stagingKept: boolean }> {
  return engineJson(`/downloads/${encodeURIComponent(jobId)}?owner=${encodeURIComponent(owner)}`, {
    method: 'DELETE',
    owner,
    unavailable: 'DEN02',
    fallback: 'DNF01',
  });
}

/** True when the engine exists at all — the Doctor's first question. */
export function engineUrl(): string {
  return env.ENGINE_URL;
}
