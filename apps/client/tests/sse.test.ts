import { describe, expect, it } from 'vitest';

import { parseFrame } from '@/lib/sse';
import { formatBytes, formatDuration, formatEta, formatShortDate, formatSpeed, truncate } from '@/lib/format';

/**
 * Two small pieces of plumbing that are easy to get subtly wrong: SSE framing
 * and duration formatting. Both are asserted directly because a bug in either
 * shows up as "the progress bar is stuck" or "the track is 0:00".
 */

describe('parseFrame', () => {
  it('parses an event and its JSON payload', () => {
    const frame = 'event: download:progress\ndata: {"id":"job1","progress":42}';

    expect(parseFrame(frame)).toEqual({ event: 'download:progress', data: { id: 'job1', progress: 42 } });
  });

  it('defaults to the message event', () => {
    expect(parseFrame('data: {"a":1}')).toEqual({ event: 'message', data: { a: 1 } });
  });

  it('joins multiple data lines, per the SSE spec', () => {
    expect(parseFrame('data: line one\ndata: line two')?.data).toBe('line one\nline two');
  });

  it('ignores comments and heartbeat frames', () => {
    expect(parseFrame(': keep-alive')).toBeNull();
    expect(parseFrame('event: ping')).toBeNull();
  });

  it('hands back a non-JSON payload instead of dropping the event', () => {
    // Dropping it is how a progress stream appears to stall.
    expect(parseFrame('event: note\ndata: hello')).toEqual({ event: 'note', data: 'hello' });
  });

  it('strips exactly one leading space after the colon', () => {
    expect(parseFrame('data:  two spaces')?.data).toBe(' two spaces');
  });
});

describe('formatDuration', () => {
  it('renders minutes and seconds', () => {
    expect(formatDuration(187)).toBe('3:07');
    expect(formatDuration(59)).toBe('0:59');
  });

  it('adds hours past an hour', () => {
    expect(formatDuration(3764)).toBe('1:02:44');
  });

  it('degrades safely on missing or negative input', () => {
    expect(formatDuration(null)).toBe('0:00');
    expect(formatDuration(Number.NaN)).toBe('0:00');
    expect(formatDuration(-5)).toBe('0:00');
  });
});

describe('formatBytes and formatSpeed', () => {
  it('scales to a unit a person reads', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(20 * 1024 * 1024)).toBe('20 MB');
  });

  it('has nothing to say about a zero or missing speed', () => {
    expect(formatSpeed(0)).toBeNull();
    expect(formatSpeed(null)).toBeNull();
    expect(formatSpeed(1024)).toBe('1.0 KB/s');
  });

  it('only reports an ETA when there is one', () => {
    expect(formatEta(0)).toBeNull();
    expect(formatEta(80)).toBe('ETA 1:20');
  });
});

describe('formatShortDate', () => {
  it('renders day and month, adding the year only when it differs', () => {
    const thisYear = new Date();
    const sameYear = new Date(Date.UTC(thisYear.getUTCFullYear(), 8, 22));

    expect(formatShortDate(sameYear)).toBe('22 Sep');
    expect(formatShortDate(new Date(Date.UTC(2019, 0, 3)))).toBe('3 Jan 2019');
  });

  it('returns an empty string for unusable input', () => {
    expect(formatShortDate(null)).toBe('');
    expect(formatShortDate('not a date')).toBe('');
  });
});

describe('truncate', () => {
  it('cuts at a word boundary when one is near the limit', () => {
    expect(truncate('a very long track title indeed', 16)).toBe('a very long…');
  });

  it('leaves a short string alone', () => {
    expect(truncate('short', 20)).toBe('short');
  });
});
