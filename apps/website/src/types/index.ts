/**
 * The website's view of the API contract.
 *
 * The types themselves live in `packages/api-types`, generated from the
 * backend's OpenAPI schema and shared with the phone app — one contract, one
 * generator run, so the two clients cannot drift apart. This file stays so
 * every existing `@/types` import keeps working.
 */
export * from '@rheoson/api-types';
