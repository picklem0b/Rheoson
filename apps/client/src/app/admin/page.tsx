'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { PageHeading } from '@/components/ui/States';
import { api, request } from '@/lib/api';

/**
 * The ops console — the server's own telemetry, for the operator.
 *
 * Three panels, one screen:
 *
 * * **Health** — deep rows (postgres, engine, relay, bus) with what each
 *   state *means*, not just a boolean.
 * * **Logs** — the server's in-memory ring, polled every 4 s, filterable by
 *   level. This is the "why did that fail" view without a log stack.
 * * **Smoke** — the two live calls that must work for the app to be usable,
 *   executed on demand with timings.
 *
 * This page is a tool, not a destination: nothing links to it, the operator
 * types the URL. It renders the same shell as the app so it works on a phone.
 */

interface HealthRow {
  name: string;
  ok: boolean;
  detail: string;
}

interface HealthReport {
  posture: string;
  ok: boolean;
  rows: HealthRow[];
}

interface LogEntry {
  time: string;
  level: string;
  msg: string;
  rest?: Record<string, unknown>;
}

interface SmokeResult {
  name: string;
  ok: boolean;
  ms: number;
  detail: string;
}

const LEVELS = ['all', 'debug', 'info', 'warn', 'error', 'fatal'] as const;

function LevelTag({ level }: { level: string }) {
  const color =
    level === 'error' || level === 'fatal'
      ? 'var(--danger)'
      : level === 'warn'
        ? 'var(--warning)'
        : 'var(--text-muted)';
  return (
    <span
      className="inline-block w-14 shrink-0 px-1 text-center font-mono text-[10px] font-bold uppercase"
      style={{ color, border: `1.5px solid ${color}`, borderRadius: 'var(--radius-xs)' }}
    >
      {level}
    </span>
  );
}

export default function AdminPage() {
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [level, setLevel] = useState<(typeof LEVELS)[number]>('all');
  const [smoke, setSmoke] = useState<SmokeResult[] | null>(null);
  const [smoking, setSmoking] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const logTop = useRef<HTMLDivElement | null>(null);

  const loadHealth = useCallback(async () => {
    try {
      setHealth(await request<HealthReport>('/api/ops/health', { quiet: true }));
    } catch {
      setHealth(null);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    try {
      const body = await request<{ entries: LogEntry[] }>(`/api/ops/logs?count=150${level === 'all' ? '' : `&level=${level}`}`, { quiet: true });
      setLogs(body.entries);
    } catch {
      // The ring is best-effort telemetry; a miss leaves the last view up.
    }
  }, [level]);

  // Health and logs are loaded from promise callbacks (not the effect's
  // synchronous pass), which keeps these from being render → fetch → render
  // cascades; the linter's setState-in-effect rule is exactly about this.
  useEffect(() => {
    void (async () => {
      await loadHealth();
    })();
  }, [loadHealth]);

  useEffect(() => {
    void (async () => {
      await loadLogs();
    })();
    const timer = window.setInterval(() => void loadLogs(), 4000);
    return () => window.clearInterval(timer);
  }, [loadLogs]);

  const runSmoke = async () => {
    setSmoking(true);
    try {
      const body = await request<{ results: SmokeResult[] }>('/api/ops/smoke', { method: 'POST', quiet: true });
      setSmoke(body.results);
    } catch {
      setSmoke(null);
    } finally {
      setSmoking(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeading title="Ops console" />

      {/* Health */}
      <section className="brut-panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="eyebrow">Health</h2>
          <button type="button" onClick={() => void loadHealth()} className="brut-btn px-3 py-1.5 text-xs" data-variant="ghost">
            Refresh
          </button>
        </div>
        {health ? (
          <>
            <p className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: health.ok ? 'var(--success)' : 'var(--danger)' }}>
              {health.ok ? '● Serving' : '● Degraded'} — {health.posture}
            </p>
            <ul className="flex flex-col gap-1.5">
              {health.rows.map((row) => (
                <li key={row.name} className="flex items-center gap-3 text-sm">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: row.ok ? 'var(--success)' : 'var(--danger)' }}
                    aria-hidden="true"
                  />
                  <span className="w-20 shrink-0 font-mono text-xs font-bold">{row.name}</span>
                  <span className="min-w-0 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {row.detail}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Health could not be read. Is the API up?
          </p>
        )}
      </section>

      {/* Smoke */}
      <section className="brut-panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="eyebrow">Smoke checks</h2>
          <button type="button" onClick={() => void runSmoke()} disabled={smoking} className="brut-btn px-3 py-1.5 text-xs" data-variant="accent">
            {smoking ? 'Running…' : 'Run now'}
          </button>
        </div>
        {smoke ? (
          <ul className="flex flex-col gap-1.5">
            {smoke.map((result) => (
              <li key={result.name} className="flex items-center gap-3 text-sm">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: result.ok ? 'var(--success)' : 'var(--danger)' }} aria-hidden="true" />
                <span className="min-w-0 flex-1 text-xs font-bold">{result.name}</span>
                <span className="shrink-0 font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {result.ms} ms
                </span>
                <span className="min-w-0 flex-1 truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {result.detail}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Runs a library read through the engine and a Postgres round trip, live.
          </p>
        )}
      </section>

      {/* Logs */}
      <section className="brut-panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="eyebrow">Logs — last 150</h2>
          <div className="flex gap-1">
            {LEVELS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setLevel(option)}
                className="px-2 py-1 font-mono text-[10px] font-bold uppercase"
                style={{
                  border: `1.5px solid ${level === option ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-xs)',
                  color: level === option ? 'var(--accent-bright)' : 'var(--text-secondary)',
                  background: level === option ? 'var(--accent-subtle)' : 'transparent',
                }}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        <div ref={logTop} className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto font-mono text-xs">
          {logs.length === 0 ? (
            <p className="py-4 text-center text-sm" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-stack-geist)' }}>
              {level === 'all' ? 'The ring is empty — the server has been quiet.' : `No ${level} entries in the ring.`}
            </p>
          ) : (
            logs
              .slice()
              .reverse()
              .map((entry, index) => {
                const key = `${entry.time}-${index}`;
                const open = expanded === key;
                return (
                  <div key={key}>
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : key)}
                      className="flex w-full items-start gap-2 px-1 py-1 text-left"
                      style={{ borderRadius: 'var(--radius-xs)', background: open ? 'var(--bg-overlay)' : 'transparent' }}
                    >
                      <span className="shrink-0 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        {entry.time.slice(11, 19)}
                      </span>
                      <LevelTag level={entry.level} />
                      <span className="min-w-0 flex-1 break-words">{entry.msg}</span>
                    </button>
                    {open && entry.rest ? (
                      <pre
                        className="mx-1 mb-1 overflow-x-auto p-2 text-[10px] leading-relaxed"
                        style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)' }}
                      >
                        {JSON.stringify(entry.rest, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                );
              })
          )}
        </div>
      </section>
    </div>
  );
}
