# Rheoson V3: Product Requirements

## What this is

A music player for a small number of people that runs on infrastructure which
costs nothing. You search a catalogue that is not ours, you play it from the
provider that serves it, and everything you curate (favourites, playlists,
history) is yours and portable.

Rheoson V3 is the TypeScript rewrite of V2. V2 was a self-hosted FastAPI app
that downloaded audio from a source that forbids it, which was neither free to
operate nor safe to publish. V3 keeps the product instincts and drops the
mechanism.

## Who it is for

Twenty people, by design. Someone who wants a clean player for openly licensed
music and their own library, and who is not paying a subscription to get it.
The audience is small on purpose: every architectural decision below is sized
for that, not for growth.

## What it does

- **Search** an external catalogue and play full tracks where the provider
  licences them.
- **Play** with a real player: queue, seek, shuffle, repeat, speed.
- **Curate**: favourites, playlists, listening history, recently played.
- **Preserve**: a library that survives a provider disappearing, with
  attribution on every track.

## Non-goals

Explicit, so they stop being debated:

- **Hosting no audio.** We never store or relay someone else's recording. The
  provider serves its own bytes.
- **No DRM circumvention, no extracting audio from a service that does not
  offer it.** Not a technical question, a legal one.
- **No social layer in 3.1 to 3.10.** No messaging, no collaborative playlists,
  no presence.
- **No mobile app in 3.1 to 3.10.** The mobile shell is a responsive web app;
  a native build is a later milestone.
- **No downloads of third-party audio.** A download feature, when it arrives,
  covers files the rights holder permits.
- **No paid tiers, no analytics products, no ads.** There is no revenue model,
  and none is planned.

## Provider posture

The catalogue is a set of adapters behind one interface, and the order is not
negotiable by convenience:

1. **Audius** is the launch provider. Its API terms permit third-party apps,
   tracks are API-accessible by default, and artists control their own licence.
2. **Jamendo** is licence-gated. Its API is free for non-commercial use only;
   any commercial use needs a quote from their licensing team. It ships only if
   that conversation happens.
3. **Metadata-only sources** (MusicBrainz, ISRC registries) enrich canonical
   records. They never become a playback source.
4. **Preview sources** (iTunes, Deezer) are metadata aids at most. Their terms
   require promotion of a store, not entertainment inside our player, so they
   are not a fallback for a missing track.

A missing track is reported as missing. Substituting a different recording is
never acceptable, not even with a notice.

## Success criteria for v3.10.0

Measurable, and small on purpose:

- A signed-in user can search, play, favourite, and build a playlist, and the
  playlist survives a reload and a week.
- Every state the app can be in has an honest surface: loading, empty, error
  with a code, and degraded provider.
- No page in the app requires the Worker to render.
- Monthly infrastructure cost is zero, and a provider outage degrades one
  feature rather than the app.

## Constraints

| Constraint | Consequence |
| --- | --- |
| Workers Free: 10 ms CPU per request | No SSR, no password hashing, no server image work |
| 100,000 requests per day | The app shell is static assets, which are free and uncounted |
| Neon free: 1 GB, 5 GB transfer per month | Query in pages, cache discovery, never N+1 |
| Web on Vercel, API on Workers | Two origins: an env-driven base URL, an exact CORS allowlist, Clerk bearer tokens, no cookies across hosts |
| 20 users | Build for correctness and taste, not for scale |

## Risks

- **Catalogue breadth.** Openly licensed music is not the commercial catalogue.
  Users will look for songs that are not there. The product has to be good at
  what it has rather than pretend.
- **Provider dependence.** One launch provider is a single point of failure.
  The adapter interface exists so a second can be added without touching the
  product.
- **Licence drift.** Provider terms change. Each adapter records the terms it
  was built against and the date it was checked.
