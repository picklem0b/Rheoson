import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetRing, deepHealth, logStats, logTap, recentLogs, smokeTests } from '../src/services/ops.service.js';

/**
 * The ops surface's contract: the log ring is bounded (a busy server must not
 * grow memory forever), filtered reads are exact, and deep health names every
 * piece of infrastructure with what its state *means* — including the relay,
 * whose absence is degraded mode, not an outage.
 *
 * Postgres is module-mocked at the top level (vi.mock hoists) with a
 * switchable impl so both the healthy and failing paths are exercised.
 */

const dbExecute = vi.fn<(query: unknown) => Promise<unknown>>(async () => ({}));

vi.mock('../src/db/client.js', () => ({
  db: { execute: (query: unknown) => dbExecute(query) },
}));

function logLine(level: number, msg: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ time: Date.now(), level, msg, ...extra });
}

/** A stream delivers asynchronously; wait until the ring stops moving. */
async function drainRing(): Promise<void> {
  for (;;) {
    const before = logStats().held;
    await new Promise((resolve) => setImmediate(resolve));
    if (logStats().held === before) return;
  }
}

beforeEach(() => {
  dbExecute.mockClear();
  dbExecute.mockImplementation(async () => ({}));
  _resetRing();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the log ring', () => {
  it('keeps what pino writes, parsed', async () => {
    logTap.write(logLine(30, 'request finished', { statusCode: 200 }));
    await drainRing();

    const entries = recentLogs(10, undefined);
    const found = entries.find((entry) => entry.msg === 'request finished');
    expect(found?.level).toBe('info');
    expect(found?.rest?.statusCode).toBe(200);
  });

  it('maps pino level numbers to names', async () => {
    logTap.write(logLine(50, 'boom'));
    await drainRing();

    const found = recentLogs(50, 'error').find((entry) => entry.msg === 'boom');
    expect(found).toBeDefined();
  });

  it('stays bounded at 500 entries', async () => {
    for (let index = 0; index < 620; index += 1) logTap.write(logLine(30, `line ${index}`));
    await drainRing();

    expect(logStats().held).toBe(500);
    // The newest survived; the oldest were dropped.
    expect(recentLogs(1, undefined)[0].msg).toBe('line 619');
  });

  it('keeps a non-JSON line as one plain entry rather than crashing', async () => {
    logTap.write('not json at all');
    await drainRing();

    const found = recentLogs(5, undefined).find((entry) => entry.msg.includes('not json'));
    expect(found).toBeDefined();
  });

  it('filters by level exactly', async () => {
    logTap.write(logLine(30, 'an info'));
    logTap.write(logLine(40, 'a warn'));
    await drainRing();

    const warns = recentLogs(50, 'warn');
    expect(warns.some((entry) => entry.msg === 'a warn')).toBe(true);
    expect(warns.some((entry) => entry.msg === 'an info')).toBe(false);
  });
});

describe('deepHealth', () => {
  it('reports every row and forgives a missing relay', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/health') && url.includes('8001')) return new Response(JSON.stringify({ ok: true }), { status: 200 });
        if (url.includes('/health') && url.includes('8002')) throw new TypeError('ECONNREFUSED');
        return new Response('{}', { status: 404 });
      }),
    );

    const report = await deepHealth();

    const names = report.rows.map((row) => row.name);
    expect(names).toContain('postgres');
    expect(names).toContain('engine');
    expect(names).toContain('relay');
    expect(names).toContain('bus');

    // The relay being down does not fail the report — the server falls back.
    expect(report.rows.find((row) => row.name === 'relay')?.ok).toBe(false);
    expect(report.ok).toBe(true);
  });

  it('fails the report when postgres is unreachable', async () => {
    dbExecute.mockImplementation(async () => {
      throw new Error('ECONNREFUSED 5432');
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));

    const report = await deepHealth();

    expect(report.ok).toBe(false);
    expect(report.rows.find((row) => row.name === 'postgres')?.ok).toBe(false);
  });
});

describe('smokeTests', () => {
  it('runs the two live checks with timings', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ tracks: [], total: 0 }), { status: 200 })));

    const results = await smokeTests('user_a');

    expect(results.map((result) => result.name)).toEqual(['engine library read', 'postgres round trip']);
    for (const result of results) {
      expect(result.ok).toBe(true);
      expect(result.ms).toBeGreaterThanOrEqual(0);
    }
  });

  it('reports a failed check honestly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('connect ECONNREFUSED');
      }),
    );
    dbExecute.mockImplementation(async () => {
      throw new Error('pool exhausted');
    });

    const results = await smokeTests('user_a');

    expect(results.every((result) => !result.ok)).toBe(true);
    expect(results[0].detail).toContain('ECONNREFUSED');
  });
});
