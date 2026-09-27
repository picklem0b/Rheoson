import { describe, expect, it } from 'vitest';

import { isHttpUrl, isTrackId } from '../src/validation';

describe('isTrackId', () => {
  it('accepts a bare video id', () => {
    for (const id of ['dQw4w9WgXcQ', 'abc123', 'a-b_c', 'A'.repeat(64)]) {
      expect(isTrackId(id), id).toBe(true);
    }
  });

  it('refuses anything that could become a path segment or an argument', () => {
    // The id reaches an upstream URL and, on the engine side, a subprocess
    // argument — so the guard must be strict, not merely type-checked.
    for (const id of [
      '',
      'a b',
      '../etc/passwd',
      'abc;rm -rf /',
      'abc$(whoami)',
      'https://www.youtube.com/watch?v=abc',
      'A'.repeat(65),
      'abc\n123',
    ]) {
      expect(isTrackId(id), id).toBe(false);
    }
  });

  it('rejects non-strings', () => {
    expect(isTrackId(undefined)).toBe(false);
    expect(isTrackId(42)).toBe(false);
    expect(isTrackId({ id: 'abc' })).toBe(false);
  });
});

describe('isHttpUrl', () => {
  it('accepts http and https', () => {
    expect(isHttpUrl('https://youtu.be/abc')).toBe(true);
    expect(isHttpUrl('http://example.test/a.mp3')).toBe(true);
  });

  it('rejects other schemes and non-URLs', () => {
    expect(isHttpUrl('file:///etc/passwd')).toBe(false);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('not a url')).toBe(false);
    expect(isHttpUrl(`https://example.test/${'a'.repeat(2048)}`)).toBe(false);
  });
});
