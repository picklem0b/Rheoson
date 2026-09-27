import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PREFERENCES,
  assertPatchShape,
  sanitizePreferences,
} from '../src/services/preferences.service.js';

/**
 * The preferences whitelist is a security boundary, not a nicety: the client
 * ships many localStorage keys, including ones for features that were removed.
 * These tests pin the four rules that keep the server from storing junk —
 * unknown keys dropped, wrong types dropped, numbers clamped, strings bounded.
 */

describe('sanitizePreferences', () => {
  it('keeps a known key with the right type', () => {
    expect(sanitizePreferences({ autoplay: false })).toEqual({ autoplay: false });
  });

  it('drops unknown keys', () => {
    expect(sanitizePreferences({ autoplay: true, 'evil-key': 'x', __proto__: 'y' })).toEqual({ autoplay: true });
  });

  it('drops a value of the wrong type', () => {
    expect(sanitizePreferences({ autoplay: 'yes', 'eq-preset': 5 })).toEqual({});
  });

  it('refuses a boolean where a number belongs', () => {
    // `Number(true) === 1` is exactly how a settings screen ends up with a
    // pre-amp of 1 dB because someone sent `true`.
    expect(sanitizePreferences({ 'pre-amp-gain': true })).toEqual({});
    expect(sanitizePreferences({ 'glass-opacity': false })).toEqual({});
  });

  it('clamps numbers to their documented range instead of rejecting them', () => {
    expect(sanitizePreferences({ 'pre-amp-gain': 100 })).toEqual({ 'pre-amp-gain': 24 });
    expect(sanitizePreferences({ 'pre-amp-gain': -100 })).toEqual({ 'pre-amp-gain': -24 });
    expect(sanitizePreferences({ 'glass-opacity': 5 })).toEqual({ 'glass-opacity': 1 });
    expect(sanitizePreferences({ 'glass-opacity': -5 })).toEqual({ 'glass-opacity': 0 });
  });

  it('rejects a non-finite number', () => {
    expect(sanitizePreferences({ 'pre-amp-gain': Number.NaN })).toEqual({});
    expect(sanitizePreferences({ 'pre-amp-gain': Number.POSITIVE_INFINITY })).toEqual({});
  });

  it('bounds string length', () => {
    expect(sanitizePreferences({ 'eq-preset': 'x'.repeat(33) })).toEqual({});
    expect(sanitizePreferences({ 'eq-preset': 'Bass' })).toEqual({ 'eq-preset': 'Bass' });
  });

  it('returns an empty patch for anything that is not an object', () => {
    expect(sanitizePreferences(null)).toEqual({});
    expect(sanitizePreferences('nope')).toEqual({});
    expect(sanitizePreferences([1, 2, 3])).toEqual({});
    expect(sanitizePreferences(undefined)).toEqual({});
  });

  it('accepts a partial patch and keeps only the valid half', () => {
    expect(sanitizePreferences({ autoplay: true, nope: 1, mono: false })).toEqual({ autoplay: true, mono: false });
  });

  it('exposes defaults for every accepted key', () => {
    // A default per key is what lets the client render a complete settings
    // screen before it has ever talked to the server.
    for (const [key, value] of Object.entries(DEFAULT_PREFERENCES)) {
      expect(sanitizePreferences({ [key]: value })).toEqual({ [key]: value });
    }
  });
});

describe('assertPatchShape', () => {
  it('accepts an object', () => {
    expect(() => assertPatchShape({ autoplay: true })).not.toThrow();
  });

  it('rejects an array, a string, null and undefined with EVA07', () => {
    for (const bad of [[], 'x', null, undefined, 42]) {
      try {
        assertPatchShape(bad);
        throw new Error('expected a rejection');
      } catch (error) {
        expect((error as { code?: string }).code).toBe('EVA07');
        expect((error as { status?: number }).status).toBe(400);
      }
    }
  });
});
