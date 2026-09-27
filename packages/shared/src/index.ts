/**
 * The shared package's public surface.
 *
 * The extensions are **required**, not stylistic: this package is ESM (see the
 * `type` field), and Node's ESM resolver does not guess extensions. Without
 * them the server — which runs the TypeScript directly through `tsx`, with no
 * build step — cannot import the registry at runtime, and the failure surfaces
 * as `does not provide an export named 'ERROR_MESSAGES'`, which reads like a
 * missing export rather than a resolution problem.
 */
export * from './error-codes.js';
export * from './types.js';
export * from './validation.js';
