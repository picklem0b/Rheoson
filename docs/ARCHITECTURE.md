# Rheoson V3: Architecture

## Shape

```
browser (Vite SPA on Vercel, static assets, free and uncounted)
   |
   |  HTTPS + Clerk bearer token
   v
Worker: Hono /api/v1  ──────────►  Neon Postgres (Drizzle)
   |                                   accounts, library, playlists, history
   |
   └──►  music providers (Audius, Jamendo, SoundCloud, Deezer, iTunes)
            search, metadata, and the audio stream itself
```

Three properties hold the design together:

1. **The app is static.** Every route is a file. No Worker invocation renders a page, which is why the request budget is spent on data rather than on HTML.
2. **The Worker is stateless.** It holds no session, no queue, no cache that must outlive a request. Anything that survives is in Postgres or in the client.
3. **The provider serves its own audio.** We resolve a stream URL and hand it to the audio element. The deployed API never proxies bytes; only the local development bridge does, so the copied V2 client plays without asking a provider for CORS headers it may not send.

## Branches and deployment

| Branch | Runs | Deployed |
| --- | --- | --- |
| `development` | the work | nowhere |
| `dev` | the release candidate | staging, from `v3.9.0` |
| `main` | production | production, from `v3.10.0` |

Two deploy targets, because a static app and a Worker have nothing to gain from sharing a host. Vercel builds `apps/web/` with the project root set to `apps/web`. Workers builds `apps/api/` with `wrangler deploy`. Each has its own environment variables and neither can see the other's secrets.

## Packages

| Path | Holds | Depends on |
| --- | --- | --- |
| `apps/web/` | React app, stores, audio engine | `@rheoson/shared` |
| `apps/api/` | Hono routes, services, repositories, Drizzle | `@rheoson/shared` |
| `packages/shared/` | contracts: envelope, error registry, zod schemas, identity | nothing |

`db/` lives inside `apps/api/` because only the API touches Postgres. A package earns its place when it has two consumers, and today only `shared` does.

Inside `apps/api/src` the request path is the folder path:

| Path | Holds |
| --- | --- |
| `routes/` | Hono routers, one file per resource, no business rules |
| `services/` | the decision, and the only layer that composes two repositories |
| `repositories/` | Drizzle queries, one file per table group, every call scoped to a verified `sub` |
| `db/` | the schema and the Neon client |
| `middleware/` | cross-cutting request work: context, CORS, auth, rate limit, errors |
| `../drizzle/` | generated migrations, committed beside the schema they describe |

## Request lifecycle

```
request
  → context (request id, one log line)
  → cors (exact origin)
  → rate limit (per caller, per minute)
  → auth (verify the Clerk JWT, resolve the subject)
  → validate (zod from @rheoson/shared)
  → service (the business decision)
  → repository (Drizzle query, batched)
  → envelope ({ ok, data, requestId })
```

Failures short-circuit through one error mapper, which turns an `ApiError` into the failure envelope with its code and the status the registry assigns. An unexpected throw becomes `CEX01`, never a stack trace on a client.

The error registry is DCCNN: one domain letter, a two-letter category, two digits. `grep SEX01` lands on one raise site, which is the point of a code a user can quote.

## Rules

- **Contracts are schemas, not types.** If two layers must agree on a shape, the shape is a zod schema in `packages/shared`. A hand-written interface mirroring a schema is the bug waiting six weeks out.
- **One query per page.** Listing N tracks is one join, not N lookups. This is both a latency rule and the reason the free Neon transfer allowance survives.
- **No provider URL is persisted.** Stream and preview URLs are signed and short-lived. Store the provider id; resolve the URL at play time.
- **Ownership comes from the token.** A user id in a request body is a claim, not a fact. Every repository call takes the `sub` the Worker verified.
- **No Worker-side work that costs milliseconds.** No hashing, no image resize, no template rendering. The 10 ms CPU budget is for validation and JSON.
- **A missing secret is a state.** `hasDatabase()` and the health checks answer a question; they never throw during boot.

## What v3.0.0 ships

| Piece | Where | Note |
| --- | --- | --- |
| envelope, errors, primitives | `packages/shared` | the single source of every shape |
| worker with middleware | `apps/api/src` | context, CORS, rate limit, error handler |
| `/health` and `/me` | `apps/api/src/routes` | health reads bindings, `/me` reads the token |
| `users` table and client | `apps/api/src/db` | first migration is generated and committed |
| accounts | `apps/api/src/services/accounts.ts` | the only layer that chooses token or row |
| tokens domain | `apps/web/src` | primitives, semantic names, component bindings |
| status page | `apps/web/src/pages/homePage.tsx` | proves the env-driven base URL end to end |

## Where state lives

| State | Home | Why |
| --- | --- | --- |
| Session | Clerk token, in memory | Never a cookie across two origins |
| Queue and playback position | client store, persisted | A reload should resume where you were |
| Offline audio | IndexedDB | A cache of what the provider already served |
| Favourites, playlists, history | Postgres | Must survive a device |
| Artwork | R2 with immutable caching | Cheap, and off the provider's hot path |
| Provider health | Postgres, short TTL | Degrade one feature, not the app |

## Provider abstraction

One interface, one canonical model:

```
search(query, opts) → ProviderTrack[]
resolveTrack(providerId) → ProviderTrack
streamUrl(providerId) → { url, expiresAt, mime }
trending(limit)?       → ProviderTrack[]     (optional; not every provider has a chart)
```

Adapters keep their own quirks and never leak them upward: a provider field with no canonical home stays inside the adapter. Canonical records merge only on ISRC or MusicBrainz id, per `packages/shared/src/track.ts`.

Five adapters sit behind that interface, and the registry (`apps/api/src/providers/registry.ts`) decides which of them answer:

| Provider | Key | Stream | Role |
| --- | --- | --- | --- |
| Audius | none | full | Primary open catalogue and the weekly chart |
| Jamendo | `JAMENDO_CLIENT_ID` | full | Independent licensed music; 35,000 requests a month, so cached aggressively |
| SoundCloud | `SOUNDCLOUD_CLIENT_ID` | full | Creator uploads, resolved through a progressive transcoding |
| Deezer | none | preview | Metadata, artwork and a keyless chart; 30-second playback |
| Apple iTunes | none | preview | Keyless first-run results with artwork and 30-second previews |

An adapter with no key reports `configured: false` and is skipped, so a fresh checkout always has Audius, Deezer and iTunes. A search fans out to every configured provider and interleaves the answers, which keeps one catalogue from owning a page; a provider that fails costs its own results and nothing else. A stream is only ever resolved against the provider that produced the track, never substituted from another one.

**Metadata fallback and playback fallback are different things.** A missing field may be filled from another provider. A missing stream may never be filled with a different recording.

## Limits this design is built around

- 10 ms CPU per invocation: validation and JSON only.
- 100,000 requests per day: static routes are free, so the budget is API calls.
- 1 GB database and 5 GB transfer per month: page everything, cache discovery.
- Two origins: `web` on Vercel, `api` on Workers. The base URL is `VITE_API_BASE_URL`, CORS is an exact allowlist, and auth is a bearer token, so there is no cross-site cookie and no session to share.
