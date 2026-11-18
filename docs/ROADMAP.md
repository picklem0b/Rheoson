# Rheoson V3: Roadmap

## How this works

The numbering is Vstore's, unchanged: `v3.[phase].[step]`.

- **One commit, one tag.** Each verified commit in a phase gets its own annotated tag, `v3.0.1`, `v3.0.2`, and so on. The commit subject says the change; the tag annotation says what landed and what was verified.
- **A phase closes with a pull request.** Once a phase's exit criteria pass, `development` goes into `dev` as a pull request titled `v3.P — <theme>`. The owner reviews and merges it. Nothing is merged to `main` by an agent.
- **A tag is cut only when the state is real:** typecheck, lint and build pass with zero errors, and the stated behaviour has been verified. A tag is never moved or deleted once published.
- **The next number is the highest existing plus one.** A phase that was never cut is never inserted between two that were.
- **A phase that changes the plan updates this file in the same commit.**

## The order, and why

The product is a music player. Everything that stands between a person and a song being audible is ordered before everything that is polish, so the order below puts the provider and the audio element in phase 1 and 2, not in phase 4 and 5.

What that moved, and what it did not:

- **The shell and the design system move back to phase 6.** The web is not being redesigned now: the status page stays, the search and the player are added to it in the tokens it already has. The phase is deferred, not deleted; it is the pass that makes the result feel deliberate.
- **The data spine moves to phase 3.** Nothing about playing one searched track needs Postgres. Saving a favourite, resuming a queue and remembering a play all do, and those come after the music works.
- **Accounts move to phase 4.** Guest-first was already the rule, so a signed-out listener is the first case rather than the edge case.

## Where V3 stands

| Phase | Tag range | Theme | Branch | State |
| --- | --- | --- | --- | --- |
| 0 | `v3.0.1` to `v3.0.10` | Environment | `development` | built |
| 1 | `v3.1.x` | Listening | `development` | built |
| 2 | `v3.2.x` | Player | `development` | next |
| 3 | `v3.3.x` | Data spine | `development` | not started |
| 4 | `v3.4.x` | Accounts | `development` | not started |
| 5 | `v3.5.x` | Library | `development` | not started |
| 6 | `v3.6.x` | Shell and design system | `development` | deferred |
| 7 | `v3.7.x` | Offline and mobile | `development` | not started |
| 8 | `v3.8.x` | Hardening | `development` | not started |
| 9 | `v3.9.x` | Release candidate | `dev` | not started |
| 10 | `v3.10.x` | Production | `main` | not started |

## Phase 0: Environment

The branch, the contracts and the two runtimes, wired so every later phase adds behaviour to a tree that already typechecks, lints, builds and deploys a worker. No product feature ships here, and nothing here is throwaway: this is the shape the whole rewrite uses.

| Step | What it lands |
| --- | --- |
| `v3.0.1` | workspace from `main`: pnpm workspace, tsconfig base, Prettier, ESLint, root scripts |
| `v3.0.2` | conventions: layout, the camelCase naming table, the branch policy |
| `v3.0.3` | shared contracts: response envelope, error registry, primitives, profile, health payload |
| `v3.0.4` | worker: request context, CORS allowlist, rate limit, one error handler, `/health` |
| `v3.0.5` | data layer: Neon client, `users` schema, Drizzle config, first migration, user repository |
| `v3.0.6` | accounts: `/me` answered by a service, from the token when there is no database |
| `v3.0.7` | web shell: Vite, design tokens, the env-driven API client, a status page reading `/health` |
| `v3.0.8` | gates: typecheck, lint, build and a worker dry run on every push |
| `v3.0.9` | documentation: PRD, ARCHITECTURE, DESIGN, this roadmap, the git system |
| `v3.0.10` | plan: listening before the shell, the deferred design phase, the renumbered phases |

**Exit criteria:** a fresh clone installs, typechecks, lints, builds and deploys a worker that answers `/health` with and without a database configured.

## Phase 1: Listening

The shortest honest route from a query to sound. One provider, one search, one audio element, and no database in the path.

- `v3.1.1` the provider interface and the Audius adapter: host discovery, search, single track, signed stream URL
- `v3.1.2` the search and stream endpoints, validated, cached for a minute per isolate, resolved per play
- `v3.1.3` the search surface: a term, a result list, the list as the queue
- `v3.1.4` the audio element: play, pause, seek, next, previous, and a failure that says why
- `v3.1.5` the plan: listening before the shell, the deferred design phase (this file)
- `v3.1.6` the brand mark as an icon set: the mark cropped square, a real multi-size favicon, a touch icon, a logo asset
- `v3.1.7` the listening screen: the mark in the header, search first, the deployment report demoted to a footer disclosure, a disabled button that stays readable

**Exit criteria:** a query returns real Audius tracks and pressing one plays it in the browser, with the URL asked for at play time and never stored.

Phase 1 deliberately excludes: accounts, a persisted queue, a stored library, offline audio and any visual redesign. The screens keep the tokens they have; `v3.1.6` and `v3.1.7` fix the icon set and the arrangement of the parts already there, they do not draw a new design.

## Phase 2: Player

The player as a thing that survives the app rather than a button on a list: one audio element that no navigation can tear down, a persisted queue, resume after a reload, Media Session metadata and hardware keys, and a stream failure that skips, says why and keeps the queue.

**Exit criteria:** a track plays across a navigation, a lock screen and a reload.

## Phase 3: Data spine

Everything the product remembers, in Postgres, reachable through repositories and never from a route.

- `tracks` with provider identity and ISRC as the only merge key
- `favourites`, `playlists`, `playlist_tracks` with explicit position
- `plays`, append-only, and one `playback_state` resume point per user
- `preferences` and `provider_health`
- one repository per table group, every query scoped to a verified subject
- Clerk webhook sync, idempotent, soft delete
- degradation: every route still answers when `DATABASE_URL` is absent

**Exit criteria:** a webhook writes a row, removing the secret changes a status string rather than breaking the app.

## Phase 4: Accounts

Clerk provider and session bridge, guest-first use, one in-context sign-in surface, a gated action that returns to what it gated, sign-out, account deletion that is honest about the library, and auth failure surfaces for an expired session or a deployment missing its config.

**Exit criteria:** two accounts see two libraries, and a signed-out visitor can still search and play.

## Phase 5: Library

Favourites end to end replacing the local store, playlist read and write, playlist screens, reorder in one transaction, listening history, recently played, and a guest's local library offered once at sign-in.

**Exit criteria:** a playlist survives a week and a second device.

## Phase 6: Shell and design system

Deferred while the product is being made playable, and unchanged in scope.

Token audit, desktop shell with a pinned player bar, mobile shell with bottom nav above it, navigation, primitives, the four states on every surface, frequency-gated motion, accent themes through one attribute, and an accessibility pass over focus, labels, contrast and keyboard order.

**Exit criteria:** every screen looks native on a phone and deliberate on a desktop, and no component reads a raw colour.

## Phase 7: Offline and mobile

Manifest, icons and install metadata, a service worker that caches the shell and never the API, an offline state that is a state rather than a toast, an install prompt shown once, notch and safe-area handling, and a defined answer for a full storage quota.

**Exit criteria:** the app opens with no network and says so.

## Phase 8: Hardening

Contract tests, an error-surface audit so every code has a screen or a sentence, rate limits reviewed per user, a performance budget for bundle, first paint and CPU per request, a security review of auth, CORS, secrets and ownership, an accessibility audit, logs worth reading, and a documentation truth pass over every command and variable.

**Exit criteria:** no red gate, no skipped test, no doc that lies.

## Phase 9: Release candidate

Full regression on desktop and phone, a staging deployment from `dev`, a smoke run of sign-in, search, play, favourite and reload, a documentation freeze, and a changelog from `v3.0.1`.

**Exit criteria:** someone who did not build it uses it for a day and reports nothing blocking.

## Phase 10: Production

Production environment and secrets, a domain, a CORS allowlist and Clerk origins that agree, monitoring and the one alert that matters, the cutover where `main` serves V3 and V2 stops, a rollback tag and the one command, and post-launch verification with real accounts.

**Exit criteria:** V3 is production and `main` is the thing running.

## After production

| Phase | Theme |
| --- | --- |
| 11 | lyrics, timed and provider-sourced |
| 12 | equalizer, presets and a real analyser |
| 13 | shared listening: blends, one room, no chat |
| 14 | a native shell that wraps the same SPA |

## Where the risk sits

- **Provider breadth.** Openly licensed catalogues are not the commercial ones. The product has to be excellent at what it has instead of pretending to have the rest.
- **One launch provider.** The adapter interface exists so a second provider is a file, not a refactor. Until it ships, Audius is a single point of failure.
- **Two origins.** Vercel plus Workers means CORS, tokens and environment variables must agree in three places. Phase 10 makes that a checklist, not a hope.
- **The 10 ms CPU budget.** Every feature that sounds like server work (hashing, images, SSR) is unavailable. Phase 8 measures it before launch, not after.
- **Legacy drift.** V2 is a `git show` away, and the temptation to copy it will be strongest exactly where it was most wrong. Take the decision, write it smaller.
