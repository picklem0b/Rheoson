'use client';

import { useEffect } from 'react';

import { Empty, Loading, PageHeading } from '@/components/ui/States';
import { formatBytes, formatEta, formatRelative, formatSpeed } from '@/lib/format';
import type { DownloadJob } from '@/lib/api';
import { useDownloadsStore } from '@/store/downloads.store';

/**
 * Downloads — live progress, and a failure you can actually read.
 *
 * A failed row shows the DCCNN code and, on request, the engine's own words.
 * That is the whole point of this screen: the previous stack's failure said
 * "YouTube refused this track" and stopped there, and there was no way to find
 * out what YouTube had actually said.
 *
 * Resume is offered only when the engine reports staged bytes — the flag comes
 * from disk, so it cannot promise bytes that are not there.
 */

function statusLabel(job: DownloadJob): string {
  if (job.status === 'queued') return 'Queued';
  if (job.status === 'running') return `${job.progress.toFixed(1)}%`;
  if (job.status === 'completed') return 'Complete';
  if (job.status === 'failed') return 'Failed';
  return 'Cancelled';
}

function statusColor(job: DownloadJob): string {
  if (job.status === 'completed') return 'var(--success)';
  if (job.status === 'failed') return 'var(--danger)';
  if (job.status === 'running' || job.status === 'queued') return 'var(--accent)';
  return 'var(--text-muted)';
}

export default function DownloadsPage() {
  const jobs = useDownloadsStore((state) => state.jobs);
  const loading = useDownloadsStore((state) => state.loading);
  const refresh = useDownloadsStore((state) => state.refresh);
  const cancel = useDownloadsStore((state) => state.cancel);
  const retry = useDownloadsStore((state) => state.retry);
  const remove = useDownloadsStore((state) => state.remove);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading && jobs.length === 0) return <Loading label="Loading downloads" />;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeading title="Downloads" note={jobs.length > 0 ? `${jobs.filter((job) => job.active).length} active` : undefined} />

      {jobs.length === 0 ? (
        <Empty text="No downloads yet. Press download on any track — progress appears here the moment it starts." />
      ) : (
        <ul className="flex flex-col gap-2">
          {jobs.map((job) => (
            <li
              key={job.id}
              className="rounded-[14px] p-3.5"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{job.title || job.target}</p>
                  <p className="truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {job.artist || 'Unknown artist'}
                    {job.totalBytes ? ` · ${formatBytes(job.totalBytes)}` : ''}
                    {` · started ${formatRelative(job.createdAt)}`}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-semibold tabular-nums" style={{ color: statusColor(job) }}>
                  {statusLabel(job)}
                </span>
              </div>

              {job.active ? (
                <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
                  <div
                    className="h-full rounded-full transition-[width]"
                    style={{ width: `${Math.max(2, job.progress)}%`, background: 'var(--accent)' }}
                    role="progressbar"
                    aria-valuenow={Math.round(job.progress)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${job.title || job.target} progress`}
                  />
                </div>
              ) : null}

              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {formatSpeed(job.speed) ? <span>{formatSpeed(job.speed)}</span> : null}
                {formatEta(job.eta) ? <span>{formatEta(job.eta)}</span> : null}
                {job.stagedBytes > 0 && job.resumable ? (
                  <span>
                    {formatBytes(job.stagedBytes)} staged — retry resumes from here
                  </span>
                ) : null}
                {job.attempts > 1 ? <span>attempt {job.attempts}</span> : null}
              </div>

              {job.status === 'failed' ? (
                <div className="mt-2.5 rounded-[10px] p-2.5" style={{ background: 'var(--danger-bg)' }}>
                  <p className="flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--danger-text)' }}>
                    {job.errorCode ? (
                      <span className="rounded-full px-2 py-0.5 font-mono text-[10px]" style={{ background: 'var(--bg-base)' }}>
                        ERROR_CODE: {job.errorCode}
                      </span>
                    ) : null}
                    {job.error ?? 'The download failed'}
                  </p>
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                {job.active ? (
                  <Action label="Cancel" onClick={() => void cancel(job.id)} />
                ) : job.status === 'failed' || job.status === 'cancelled' ? (
                  <>
                    <Action label={job.resumable ? 'Resume' : 'Retry'} primary onClick={() => void retry(job.id, job.resumable)} />
                    {job.resumable ? <Action label="Start over" onClick={() => void retry(job.id, false)} /> : null}
                  </>
                ) : (
                  <Action label="Play" primary onClick={() => void playCompleted(job)} />
                )}
                <Action label="Remove" onClick={() => void remove(job.id)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function playCompleted(job: DownloadJob): Promise<void> {
  if (!job.trackId) return;
  const { usePlayerStore } = await import('@/store/player.store');
  const { api } = await import('@/lib/api');
  const { tracks } = await api.libraryTracks(500);
  const track = tracks.find((item) => item.id === job.trackId);
  if (track) void usePlayerStore.getState().playTrack(track, tracks);
}

function Action({ label, onClick, primary = false }: { label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-medium transition-opacity active:opacity-70"
      style={
        primary
          ? { background: 'var(--accent)', color: 'rgb(255 255 255)', border: '1px solid transparent' }
          : { background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }
      }
    >
      {label}
    </button>
  );
}
