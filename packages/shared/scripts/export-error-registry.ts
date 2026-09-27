/**
 * Export the DCCNN registry as JSON.
 *
 * The Python engine cannot import TypeScript, so the registry is published as
 * a committed artifact instead of being re-declared in Python. `errorRegistryJson`
 * is the single serialiser; this script only writes its output. A test asserts
 * the committed file matches the registry, so editing a code without re-running
 * this script fails the suite rather than silently drifting.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { errorRegistryJson } from '../src/error-codes';

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, '../generated/error-codes.json');

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${errorRegistryJson()}\n`, 'utf8');

console.log(`error registry written to ${target}`);
