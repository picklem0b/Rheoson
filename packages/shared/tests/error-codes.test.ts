import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import {
  ALL_ERROR_CODES,
  DOMAIN_LETTERS,
  ERROR_DOMAINS,
  ERROR_MESSAGES,
  errorRegistryJson,
  isRegisteredCode,
  messageForCode,
  wireDetail,
} from '../src/error-codes';

describe('DCCNN registry contract', () => {
  it('every code matches the DCCNN shape', () => {
    for (const code of ALL_ERROR_CODES) {
      expect(code).toMatch(/^[A-Z]{3}\d{2}$/);
    }
  });

  it('codes are globally unique (a code lands on exactly one raise site)', () => {
    const seen = new Set<string>();
    for (const code of ALL_ERROR_CODES) {
      expect(seen.has(code), `duplicate code ${code}`).toBe(false);
      seen.add(code);
    }
  });

  it('every domain member maps to a message with the domain letter', () => {
    for (const [domain, members] of Object.entries(ERROR_DOMAINS)) {
      // Registry sections own their letter (SEARCH→R, not S): the port
      // mirrors the Python source, so this map — not the domain name — is law.
      const letter = DOMAIN_LETTERS[domain];
      expect(letter, `${domain} missing from DOMAIN_LETTERS`).toBeTruthy();
      for (const [attr, code] of Object.entries(members)) {
        expect(ERROR_MESSAGES[code], `${domain}.${attr} missing message`).toBeTruthy();
        expect(code[0], `${domain}.${attr} = ${code} wrong domain letter`).toBe(letter);
      }
    }
  });

  it('wire format renders the machine-readable chip', () => {
    expect(wireDetail('DEX01')).toBe('Download failed [ERROR_CODE: DEX01]');
    expect(wireDetail('MVA01', 'Custom prefix')).toBe('Custom prefix [ERROR_CODE: MVA01]');
  });

  it('isRegisteredCode accepts registered and rejects unknown', () => {
    expect(isRegisteredCode('DEX01')).toBe(true);
    expect(isRegisteredCode('ZZZ99')).toBe(false);
    expect(isRegisteredCode('nope')).toBe(false);
  });

  it('messageForCode throws on unregistered codes (programming error, not runtime)', () => {
    expect(() => messageForCode('ZZZ99')).toThrow(/not registered/);
  });

  it('registry count matches the Python source (122 codes at v2.22.1)', () => {
    // Pinned so a silent port-drift is impossible: if the Python registry
    // grows, this number grows WITH it, in the same commit.
    expect(ALL_ERROR_CODES.length).toBe(122);
  });

  it('the committed JSON artifact matches the registry (drift is a test failure)', () => {
    // The Python engine reads this file instead of re-declaring the registry.
    // Regenerate it with `pnpm --filter @rheoson/shared export:error-registry`.
    const here = dirname(fileURLToPath(import.meta.url));
    const artifact = readFileSync(resolve(here, '../generated/error-codes.json'), 'utf8');
    expect(JSON.parse(artifact)).toEqual(JSON.parse(errorRegistryJson()));
  });

  it('JSON export is parseable and carries the wire format', () => {
    const parsed = JSON.parse(errorRegistryJson()) as {
      wire: string;
      codes: Record<string, string>;
      domains: Record<string, Record<string, string>>;
    };
    expect(parsed.wire).toBe('[ERROR_CODE: DCCNN]');
    expect(Object.keys(parsed.codes).length).toBe(ALL_ERROR_CODES.length);
    expect(parsed.domains.DOWNLOAD.FAILED).toBe('DEX01');
  });
});
