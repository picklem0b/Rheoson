#!/usr/bin/env node
/**
 * Build guard for the one misconfiguration that makes the whole app look
 * broken: a production bundle with no absolute API origin.
 *
 * Why this exists
 * ---------------
 * Inside the APK the WebView serves the bundle from https://localhost and
 * there is no dev proxy. If `VITE_API_URL` is unset (or empty) the API base
 * becomes the relative "/api", every request is answered by the asset handler
 * with index.html, and the user sees a dead player, an empty library and
 * "Backend returned HTML instead of JSON". That shipped once; this check makes
 * sure it cannot ship again.
 *
 * Usage: node scripts/verify-api-base.mjs   (after `vite build`)
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const CANONICAL = 'https://rheoson-api-9e4c.onrender.com';

/** Same-origin deployments (nginx / the VPS stack) are a real configuration. */
const configured = process.env.VITE_API_URL;
if (configured !== undefined && configured.trim() === '') {
  console.log('[verify-api-base] Same-origin build (VITE_API_URL is empty) — nothing to check.');
  process.exit(0);
}

const expected = (configured ?? '').trim().replace(/\/+$/, '') || CANONICAL;

if (!existsSync(DIST)) {
  console.error(`[verify-api-base] ${DIST}/ does not exist — run the build first.`);
  process.exit(1);
}

/** Every JS file the browser can load from the built app. */
function jsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsFiles(path));
    else if (entry.name.endsWith('.js')) out.push(path);
  }
  return out;
}

const files = jsFiles(DIST);
const hit = files.some((file) => readFileSync(file, 'utf8').includes(expected));

if (!hit) {
  console.error(
    `[verify-api-base] FAILED: no bundle contains the API origin "${expected}".\n` +
      'This build would call a relative /api and get HTML back instead of JSON.\n' +
      'Set VITE_API_URL to the absolute backend origin (see web/.env.example).',
  );
  process.exit(1);
}

console.log(`[verify-api-base] OK — bundles embed the API origin ${expected}.`);
