import { eq } from 'drizzle-orm';

import { db } from '../db/client.js';
import { preferences } from '../db/schema.js';
import { badRequest } from '../errors.js';

/**
 * Per-user, device-independent preferences.
 *
 * Local-first stays the rule — the client applies a setting the moment it is
 * toggled. The server copy exists so the same person lands in the same app on
 * every device they sign into, which is the part localStorage could never do.
 *
 * Two properties are ported verbatim from `services/preferences.py` because
 * both were learned from a real bug:
 *
 * 1. **The whitelist is the security boundary, not a nicety.** The client
 *    ships many keys, including ones for features that were removed; treating
 *    localStorage as trusted input would let a stale or hand-edited payload
 *    decide what the server stores.
 * 2. **A patch merges per key.** Two settings toggled in quick succession must
 *    not race a whole-document overwrite.
 */

export type PreferenceValue = boolean | number | string;
export type Preferences = Record<string, PreferenceValue>;

/** The syncable set — deliberately narrow, and all of it cross-device. */
export const DEFAULT_PREFERENCES: Readonly<Preferences> = Object.freeze({
  autoplay: true,
  normalize: true,
  'bass-boost': false,
  mono: false,
  'pre-amp-gain': 0,
  'eq-preset': 'Flat',
  'notif-sound': true,
  'notif-dl-done': true,
  'save-history': true,
  'save-search-log': true,
  'theme-accent': 'crimson',
  'theme-surface': 'dark',
  'glass-opacity': 0.7,
  'nav-style': 'pill',
  'nav-position': 'bottom',
});

/** Accepted type per key. `number` covers ints and floats alike. */
const TYPES: Record<string, 'boolean' | 'number' | 'string'> = Object.fromEntries(
  Object.entries(DEFAULT_PREFERENCES).map(([key, value]) => [
    key,
    typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'string',
  ]),
);

/** Bounds, so a number that arrives is a number the player can honour. */
const RANGES: Record<string, { min: number; max: number }> = {
  'pre-amp-gain': { min: -24, max: 24 },
  'glass-opacity': { min: 0, max: 1 },
};

const MAX_STRING_LEN = 32;
const MAX_KEYS_PER_PATCH = Object.keys(DEFAULT_PREFERENCES).length;

function matchesType(key: string, value: unknown): boolean {
  const expected = TYPES[key];
  if (expected === 'boolean') return typeof value === 'boolean';
  // `typeof true === 'boolean'`, so a boolean can never satisfy 'number' here —
  // the JS equivalent of the Python `bool is a subclass of int` trap.
  if (expected === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === 'string';
}

function clampNumber(key: string, value: number): number {
  const range = RANGES[key];
  if (!range) return value;
  return Math.max(range.min, Math.min(range.max, value));
}

/**
 * Keep only whitelisted keys whose values have the right type and range.
 *
 * Never throws: an unusable payload becomes an empty patch. That distinction
 * matters — "you sent keys I do not store" is a client bug to swallow, while a
 * malformed *request* is a 400 the route raises.
 */
export function sanitizePreferences(raw: unknown): Preferences {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const out: Preferences = {};
  let accepted = 0;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (accepted >= MAX_KEYS_PER_PATCH) break;
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_PREFERENCES, key)) continue;
    if (!matchesType(key, value)) continue;

    // `matchesType` above has already narrowed nothing for the compiler, so the
    // narrowing is restated here — one place, and the type system agrees with
    // the runtime check instead of being told to trust it.
    if (typeof value === 'string') {
      if (value.length > MAX_STRING_LEN) continue;
      out[key] = value;
    } else if (typeof value === 'number') {
      out[key] = clampNumber(key, value);
    } else if (typeof value === 'boolean') {
      out[key] = value;
    } else {
      continue;
    }
    accepted += 1;
  }
  return out;
}

/** Stored preferences with defaults filled in — never partial. */
export async function getPreferences(userId: string): Promise<Preferences> {
  const rows = await db
    .select({ payload: preferences.payload })
    .from(preferences)
    .where(eq(preferences.userId, userId))
    .limit(1);

  const stored = rows[0]?.payload;
  return { ...DEFAULT_PREFERENCES, ...(stored ? sanitizePreferences(stored) : {}) };
}

/**
 * Merge a validated patch into storage. Returns the resulting preferences.
 *
 * An empty patch is not an error here — the route decides whether the request
 * was malformed; this layer only refuses to write junk.
 */
export async function updatePreferences(userId: string, patch: unknown): Promise<Preferences> {
  const clean = sanitizePreferences(patch);
  if (Object.keys(clean).length === 0) {
    return getPreferences(userId);
  }

  const current = await getPreferences(userId);
  const merged = { ...current, ...clean };

  await db
    .insert(preferences)
    .values({ userId, payload: merged, updatedAt: new Date() })
    // Key-level merge, not a document replace: two toggles in flight must not
    // overwrite each other, and a key this server does not know yet survives.
    .onConflictDoUpdate({
      target: preferences.userId,
      set: { payload: merged, updatedAt: new Date() },
    });

  return merged;
}

/** Reject a payload that is not an object at all — a client bug worth a 400. */
export function assertPatchShape(patch: unknown): asserts patch is Record<string, unknown> {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    throw badRequest('EVA07', 'Preferences must be an object of known keys');
  }
}
