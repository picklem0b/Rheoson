# Rheoson SaaS Transformation Specification

**Product:** Rheoson  
**Objective:** Transform Rheoson from a fragile music application into a reliable, discoverable, scalable SaaS product capable of serving a global audience and competing seriously in the music-streaming market.

---

## 1. Product standard

Rheoson must be treated as a real internet product, not as a collection of working screens.

A production-ready Rheoson must be:

- Reliable during normal use and partial failure.
- Secure across users, devices, workers, and storage.
- Fast for search, library browsing, artwork, and playback.
- Discoverable through search engines and shareable links.
- Usable on desktop, mobile web, Android, and eventually iOS.
- Observable by operators.
- Recoverable after process, worker, database, network, or host failure.
- Capable of adding features without continuously destabilizing playback.
- Documented as a product and system, without private development conversation notes.

Feature development is **not stopped**. New features continue through the product roadmap, while every feature must use the new reliability, authorization, observability, and testing contracts defined here.

---

## 2. Current technology stack

Rheoson is currently a React/Python application, not a conventional MERN stack.

| Area | Current technology | Current assessment |
|---|---|---|
| Web | React 18, TypeScript, Vite | Good current foundation; application structure is becoming difficult to maintain. |
| Client state | Zustand, TanStack Query | Suitable, but persistence and cache responsibilities are duplicated. |
| Audio | Howler, Media Session, custom player hooks | Valuable but currently fragile because player ownership is not centralized. |
| Web caching | Workbox service worker, IndexedDB, localStorage | Too many overlapping caches; audio and mutation caching are unsafe. |
| Mobile | Capacitor Android | Fast reuse of web UI; limited for high-quality background audio and native storage. |
| API | FastAPI, Python, Pydantic | Strong fit for the current media and provider ecosystem. |
| Media | yt-dlp, FFmpeg, mutagen, image/media libraries | Keep Python; move heavy execution into supervised workers. |
| Database | MongoDB plus JSON and SQLite sidecars | Viable, but ownership and authority of each store must be explicit. |
| Realtime | Socket.IO | Suitable after authentication, rooms, persistence, and multi-instance coordination are fixed. |
| Cache/coordination | Redis configuration only | Redis is not currently implemented as a working cache, queue, limiter, lock service, or Socket.IO manager. |
| Edge | Caddy and nginx configurations | Multiple contradictory deployment paths exist; Caddy should become the production edge. |
| Packaging | Docker Compose, Render, VPS scripts, Capacitor | Broad support, but production is not reproducible enough. |
| Search/SEO | SPA routes and client rendering | Missing a proper public SEO and indexation strategy. |

---

## 3. Target technology direction

The target is a **modular SaaS platform with a TypeScript web product, a durable control plane, and Python media workers**.

```text
                         Public internet
                               |
                  CDN / Caddy / TLS / security headers
                               |
              Next.js web product and public SEO pages
                               |
                  TypeScript shared contracts and UI
                               |
             API/control plane: FastAPI initially or
                    TypeScript service incrementally
                               |
        ------------------------------------------------
        |                    |                         |
   MongoDB/Postgres      Real Redis              Object/media storage
   durable application   queues, locks,           completed artifacts
   and user state        limits, pub/sub
                               |
                    Private Python worker pool
                      yt-dlp + FFmpeg + mutagen
```

### Target principles

1. The web product and public pages may migrate to Next.js.
2. The media domain remains Python.
3. Heavy media processes do not run inside ordinary API requests.
4. All important jobs and user data are durable.
5. Redis is used only after a real implementation exists and is tested.
6. Audio bytes do not belong in Redis; Redis coordinates them.
7. A framework migration must solve a documented problem or improve a measurable product metric.
8. Feature work continues, but new features must use shared contracts and acceptance tests.

---

# 4. Complete issue register and direct solutions

Every issue below has a direct solution and an improvement target. Severity:

- **P0:** security, data loss, broken core journey, or production cannot operate.
- **P1:** significant reliability, scale, or product-quality problem.
- **P2:** important product improvement that does not block the core service.

## 4.1 Product architecture and service boundaries

### ARCH-001 — API process owns too many responsibilities

**Severity:** P0  
**Problem:** The API handles HTTP, Socket.IO, downloads, yt-dlp, FFmpeg, stream filling, scheduled tasks, caches, library scans, and administrative filesystem operations.

**Solution:** Keep FastAPI as the control plane initially. Move downloads, remote fills, FFmpeg conversion, tagging, library scans, and maintenance tasks into private Python workers. The API creates durable jobs and reports their state.

**Improvement:** API workers become stateless and can scale independently from media workers. A worker crash no longer takes down normal API traffic.

**Acceptance test:** Stop a media worker during a job. API requests remain responsive, the job remains visible, and the job is safely retried or marked recoverable.

### ARCH-002 — Process-local state prevents scaling

**Severity:** P0  
**Problem:** Jobs, download processes, rate limits, stream sessions, Socket.IO state, caches, and schedulers are stored in memory.

**Solution:** Put durable job state in MongoDB or PostgreSQL. Use Redis for distributed locks, queues, limits, pub/sub, and short-lived coordination. Run scheduled tasks under one leader.

**Improvement:** Multiple API and worker processes can operate without duplicate jobs or split state.

### ARCH-003 — Router code accesses service internals

**Severity:** P1  
**Problem:** HTTP routes directly mutate private structures such as the download service's `_jobs` dictionary.

**Solution:** Add domain methods such as `list_jobs(owner_id)`, `get_job(owner_id, job_id)`, `cancel_job(owner_id, job_id)`, and `delete_job(owner_id, job_id)`.

**Improvement:** Authorization, persistence, and business rules become impossible to bypass accidentally from a route.

### ARCH-004 — Public/private media model is undefined

**Severity:** P0  
**Problem:** Some audio, artwork, warm, and proxy routes are unauthenticated while downloads and user state are private.

**Solution:** Choose explicit policies per resource:

- Public catalog metadata may be public.
- Private user libraries require authentication.
- Audio requires a short-lived signed URL or authenticated media cookie.
- Cache keys must include the tenant/user scope when content is private.

**Improvement:** The product can safely support both public discovery and private libraries.

---

## 4.2 Authentication, authorization, and account security

### AUTH-001 — Custom login flow must be verified against Clerk's supported flow

**Severity:** P0  
**Problem:** The current backend login path finds a Clerk user by email and creates a session without clearly passing the submitted password through a valid password-verification lifecycle.

**Solution:** Use Clerk's supported frontend sign-in flow, or implement Clerk's documented sign-in attempt and verification protocol exactly. The Rheoson API should verify the resulting session token rather than recreate Clerk credential handling.

**Improvement:** Correct password, MFA, account lock, session, and credential behavior are delegated to the identity provider.

### AUTH-002 — JWT issuer validation is too broad

**Severity:** P0  
**Problem:** Issuer validation accepts broad Clerk-related domains rather than binding to the configured Clerk instance.

**Solution:** Validate the exact allowed issuer or configured Clerk instance. Validate algorithm, key ID, expiration, not-before, issuer, and any required claims.

### AUTH-003 — Download jobs are not consistently owner-scoped

**Severity:** P0  
**Problem:** REST access is partially owner-aware, but job state and direct mutations have legacy/global paths.

**Solution:** Store `owner_id` on every job. Filter every read and mutation by owner. Migrate or quarantine legacy ownerless jobs before private multi-user operation.

### AUTH-004 — Socket.IO accepts anonymous connections and broadcasts globally

**Severity:** P0  
**Problem:** Connected clients can receive other users' download progress, titles, errors, IDs, and possibly server paths.

**Solution:** Authenticate the Socket.IO handshake. Join `user:<user_id>` rooms. Emit job events only to the owning room. Remove physical file paths from all client payloads.

### AUTH-005 — Administrative filesystem actions are not consistently admin-only

**Severity:** P0  
**Problem:** Directory management, doctor operations, rescans, tool updates, cache clearing, and restore operations do not share one consistent administration policy.

**Solution:** Add explicit roles and policy dependencies. Separate account actions from instance actions. Require an administrator for all instance-level changes.

### AUTH-006 — Client caches are not safely cleared on account change

**Severity:** P0  
**Problem:** IndexedDB, Cache Storage, React Query, localStorage, player state, and offline queues are not consistently scoped by user and server.

**Solution:** Namespace all client data by server and user, or clear it during logout/account switch. Do not replay a previous user's offline mutations under another account.

---

## 4.3 Playback and streaming

### PLAY-001 — Multiple components can own the global player

**Severity:** P0  
**Problem:** The player hook is consumed by multiple pages and controls. Unmounting an incidental consumer can stop timers or interfere with the global Howler instance.

**Solution:** Create one `PlayerProvider` or one player engine mounted above routing. Components consume commands and state; they do not own the audio lifecycle.

**Improvement:** Playback survives route changes, modal changes, and component unmounts.

### PLAY-002 — Service Worker caches partial audio as complete audio

**Severity:** P0  
**Problem:** `206 Partial Content` responses can be stored by a CacheFirst route and later treated as complete audio.

**Solution:** Never cache 206 as a complete asset. Only cache a verified full `200` artifact with known length, MIME type, checksum, and completion status. Let range slicing operate only on that full artifact.

### PLAY-003 — Audio caching duplicates work and can hang

**Severity:** P0  
**Problem:** The client performs whole-file IndexedDB fills for current and upcoming tracks while the service worker also caches audio. Live/chunked streams may never provide a usable complete blob.

**Solution:** Use one explicit offline-download pipeline. Disable automatic ahead-of-time whole-file warming until it is correct. A user-requested offline download must produce a complete validated artifact.

### PLAY-004 — Stream relay is not globally admission-controlled

**Severity:** P1  
**Problem:** Direct relay paths can bypass fill-session limits and create many outbound clients, connections, and caches.

**Solution:** Add global and per-user stream limits, upstream connection limits, bandwidth/egress budgets, timeouts, cancellation, and bounded failure caching.

### PLAY-005 — Remote playback sync can start paused tracks

**Severity:** P1  
**Problem:** Remote state application can call track setup with default autoplay behavior.

**Solution:** Apply remote state explicitly: set track without autoplay, then seek, then play only when the remote state is playing. Add revision numbers and stale-event rejection.

### PLAY-006 — Socket reconnect does not reliably refresh authentication

**Severity:** P1  
**Problem:** Socket authentication depends on a synchronous token snapshot and can remain connected without a current token.

**Solution:** Connect only after the async token provider is ready. Reconnect on token refresh. Use bounded exponential backoff and fetch authoritative state after reconnect.

### PLAY-007 — Android WebView is not a complete background-audio solution

**Severity:** P1  
**Problem:** Browser Media Session and Howler do not provide a reliable Android background audio service.

**Solution:** Either define foreground-only Capacitor playback honestly or implement native Media3/audio focus/notification/background service. React Native becomes attractive only if native background playback is a core requirement.

### PLAY-008 — Local Android file assumptions are invalid

**Severity:** P0  
**Problem:** The APK cannot automatically read Termux-private paths under a different Android UID. Local ID generation and extension handling also disagree with backend expectations.

**Solution:** Use app-managed downloads or Android Storage Access Framework/media permissions. Use one canonical track identity and correct extension parsing.

---

## 4.4 Caching and performance

### CACHE-001 — Redis is not actually implemented

**Severity:** P0  
**Problem:** `REDIS_URL` is declared and may influence a health display, but there is no real Redis client, ping, queue, limiter, lock manager, Socket.IO Redis adapter, or cache implementation.

**Solution:** Implement one lifecycle-managed async Redis client with TLS/auth support, connection health, namespaced keys, TTLs, reconnect limits, and an explicit degraded mode. Add integration tests against a real Redis instance.

**Improvement:** Redis then provides measurable coordination rather than a misleading configuration flag.

### CACHE-002 — In-memory rate limits cannot protect multiple processes

**Severity:** P1  
**Problem:** Each process has a separate limiter.

**Solution:** Use atomic Redis counters or Lua scripts for route/IP/user limits. Test enforcement across two API processes.

### CACHE-003 — Direct URL cache is unbounded

**Severity:** P1  
**Problem:** Direct URL and failure caches lack reliable size, TTL, and byte limits.

**Solution:** Add TTL, maximum entries, maximum bytes, LRU cleanup, negative-cache duration, and metrics for hits/misses/evictions.

### CACHE-004 — Remote audio cache is not safely shared

**Severity:** P1  
**Problem:** Shared disk cache lacks complete cross-process coordination and may silently fail on permissions.

**Solution:** Create the cache directory during deployment, assign correct ownership, publish artifacts atomically, use Redis or file locks for single-flight fills, and reconcile incomplete files.

### CACHE-005 — Library cache prevents refresh

**Severity:** P0  
**Problem:** A nonempty IndexedDB library result can be returned indefinitely without server revalidation.

**Solution:** Use TanStack Query as the primary read cache with stale times and invalidation. Use IndexedDB only as timestamped offline fallback. Invalidate after downloads, rescans, mutations, and reconnects.

### CACHE-006 — Search calls providers without effective caching and coalescing

**Severity:** P1  
**Problem:** Search can issue multiple provider requests, recursively scan local files, and schedule ineffective prewarm requests.

**Solution:** Add provider semaphores, deadlines, short-TTL result caching, stale-on-error behavior, request coalescing, and a precomputed local index. Remove cold HEAD prewarming unless it produces a measured cache hit.

### CACHE-007 — Artwork and API caches lack one ownership policy

**Severity:** P1  
**Problem:** Artwork, authenticated metadata, audio, and API responses use different cache systems and may expose stale or private data.

**Solution:** Define a cache policy for every resource: public/private, key, TTL, invalidation event, storage system, size limit, and logout behavior.

---

## 4.5 Downloads and media jobs

### JOB-001 — Job creation is not always persisted before returning

**Severity:** P0  
**Problem:** Some jobs are inserted and scheduled without immediate durable persistence. Resolution failures may not update the stored record.

**Solution:** Persist the job transactionally before returning `202`. Persist every state transition and failure. Use an idempotency key.

### JOB-002 — Restart recovery is incomplete

**Severity:** P0  
**Problem:** Jobs may remain invisible after restart until another job is created. Active tasks and subprocesses are not fully supervised during shutdown.

**Solution:** Load/reconcile jobs during startup. Add leases, worker heartbeats, stale-job recovery, process-group termination, and bounded shutdown waits.

### JOB-003 — User-selected concurrency can bypass server capacity

**Severity:** P0  
**Problem:** The request can influence the effective concurrency while the server setting is treated as a default.

**Solution:** Enforce a server-owned global maximum, per-user queue/running limits, batch quotas, and disk/CPU admission checks.

### JOB-004 — Cancellation does not own every child process

**Severity:** P0  
**Problem:** Some stream fallback processes are not retained for cancellation, and shutdown can leave child processes alive.

**Solution:** Create one process supervisor. Track every child process and process group. Terminate, wait, kill if necessary, and record the result.

### JOB-005 — Artifact publication is not a fully defined transaction

**Severity:** P1  
**Problem:** Partial files, duplicate outputs, and crashes during finalization can create inconsistent library state.

**Solution:** Use per-job staging directories, checksum/metadata validation, atomic rename or object-store commit, and a reconciliation job.

### JOB-006 — Download jobs are not a real queue

**Severity:** P1  
**Problem:** In-memory asyncio tasks do not provide durable queue semantics.

**Solution:** Introduce Redis Streams, a compatible queue, or a managed queue. Use job leases, retries, dead-letter state, and idempotent workers.

### JOB-007 — Provider/tool updates occur inside the product path

**Severity:** P1  
**Problem:** Updating yt-dlp in place from an admin endpoint is not a controlled release strategy.

**Solution:** Pin yt-dlp and FFmpeg in worker images. Upgrade through CI-built images, canary validation, and rollback.

---

## 4.6 Data and library management

### DATA-001 — Multiple stores have unclear authority

**Severity:** P1  
**Problem:** MongoDB, JSON sidecars, SQLite, IndexedDB, localStorage, Cache Storage, and filesystem artifacts all hold parts of the product state.

**Solution:** Define one authoritative store per entity. Make sidecars rebuildable. Move user-owned state and jobs to the durable database. Keep local indexes only as derived data.

### DATA-002 — File-backed playlist writes are not sufficiently concurrent-safe

**Severity:** P1  
**Problem:** Some JSON writes are not atomic or locked.

**Solution:** Use database authority, or atomic temp-file replacement plus locking and crash tests.

### DATA-003 — Library search rescans too much work

**Severity:** P1  
**Problem:** Local search can recursively inspect and parse the filesystem during requests.

**Solution:** Run incremental background indexing. Store file identity, mtime, size, hash where appropriate, tags, and scan checkpoint.

### DATA-004 — Track identity differs between backend and native client

**Severity:** P0  
**Problem:** Native local files can receive an incompatible client-generated identity.

**Solution:** Define one versioned track identity algorithm and use it across API, web, mobile, indexes, cache keys, and artifacts.

### DATA-005 — Backup and restore are not operationally proven

**Severity:** P1  
**Problem:** Manual backup instructions are not enough for a SaaS.

**Solution:** Schedule encrypted off-host backups, retain versions, monitor backup success, and perform restore drills regularly.

---

## 4.7 Frontend architecture and UI quality

### WEB-001 — Large components combine data, state, layout, and side effects

**Severity:** P1  
**Problem:** Large pages and hooks make regressions difficult to isolate.

**Solution:** Split by domain: queries, commands, state machines, view components, and route composition. Do not split only by arbitrary file size.

### WEB-002 — Direct localStorage usage is scattered

**Severity:** P1  
**Problem:** Many modules independently read and write preferences and account data.

**Solution:** Create one typed persistence service with schema versions, migrations, account/server namespace, quota handling, and test coverage.

### WEB-003 — Offline mutation mechanisms duplicate each other

**Severity:** P0  
**Problem:** Workbox background sync and an application IndexedDB queue can retry the same mutation independently.

**Solution:** Use one outbox. Give each mutation an idempotency key, typed state, retry/backoff policy, conflict behavior, and visible failure state.

### WEB-004 — Errors are silently swallowed

**Severity:** P1  
**Problem:** Native plugin failures, token failures, queue failures, and cache failures often become silent no-ops.

**Solution:** Classify errors, log them with correlation IDs, show user-actionable states, and expose diagnostics to operators without leaking secrets.

### WEB-005 — UI lacks production-grade state communication

**Severity:** P1  
**Problem:** Users need clearer states for loading, buffering, queueing, downloading, retrying, offline availability, and provider failure.

**Solution:** Define shared state components and UX rules for every async journey. Every action must end in success, retryable error, permanent error, or queued state.

### WEB-006 — Accessibility and responsive behavior require systematic testing

**Severity:** P2  
**Solution:** Add keyboard navigation, focus management, screen-reader labels, reduced-motion support, contrast checks, dynamic viewport testing, large text testing, rotation testing, and Playwright accessibility checks.

---

## 4.8 SEO, public SaaS, and discoverability

### SEO-001 — No complete public SEO foundation

**Severity:** P1  
**Problem:** The client does not yet provide the standard public SaaS indexation layer: XML sitemap, robots policy, canonical URLs, metadata templates, Open Graph, Twitter cards, structured data, and server-rendered public pages.

**Solution:** Use Next.js for public routes and add:

- `sitemap.xml` generated from indexable public content.
- `robots.txt` with deliberate allow/disallow rules.
- Canonical URLs.
- Unique title and description templates.
- Open Graph and social preview images.
- JSON-LD structured data where applicable.
- Noindex for authenticated, search-result, admin, and private library pages.
- Correct 404, 410, and redirect behavior.
- Search Console and analytics verification.

### SEO-002 — Public and private routes are not separated

**Severity:** P1  
**Solution:** Define an indexable public content model. Public artist/album/track pages can be server-rendered if legally and product-wise appropriate. Private library, playlists, downloads, and account routes must not be indexed.

### SEO-003 — Metadata is not data-driven

**Severity:** P2  
**Solution:** Create shared metadata functions for product pages, artists, albums, tracks, playlists, campaigns, and errors. Test title length, description length, canonical URL, and social image generation.

### SEO-004 — Public performance is not measured

**Severity:** P1  
**Solution:** Measure Core Web Vitals, first contentful paint, largest contentful paint, interaction latency, image weight, JavaScript size, and mobile performance. Set budgets in CI.

---

## 4.9 Mobile platform

### MOBILE-001 — Capacitor native plugins are incomplete or fragile

**Severity:** P1  
**Solution:** Install only supported plugins, register custom plugins through the documented API, request permissions explicitly, and surface unsupported capability states.

### MOBILE-002 — Background download and background playback are different products

**Severity:** P1  
**Solution:** Design separate lifecycle services. A foreground download service does not provide background audio. If background audio is essential, implement Media3/audio focus/notification or move the mobile client to React Native/native modules.

### MOBILE-003 — Mobile release versions do not match web/API versions

**Severity:** P1  
**Solution:** Use one release manifest and CI-generated version values for web, API, APK, and update notifications.

### MOBILE-004 — Native API configuration can silently be wrong

**Severity:** P0  
**Solution:** Require an absolute production API URL for APK builds. Fail the build if it is missing or points to development.

---

## 4.10 Infrastructure and deployment

### INFRA-001 — Caddy upstream protocol is incompatible

**Severity:** P0  
**Problem:** Caddy uses `h2c://api:8000` while the API runs ordinary Uvicorn HTTP.

**Solution:** Use ordinary HTTP upstreams or explicitly configure and test h2c. Add an end-to-end proxy test.

### INFRA-002 — Production Compose files contradict each other

**Severity:** P0  
**Problem:** Base, production, and VPS Compose files have conflicting images, ports, health checks, volumes, and commands.

**Solution:** Make one VPS Compose file authoritative. Keep a separate clearly named local-development file. Retire or mark legacy production files.

### INFRA-003 — Health check uses unavailable curl

**Severity:** P0  
**Solution:** Use a Python or wget probe available in the runtime image. Check readiness, not only process liveness.

### INFRA-004 — Production web image is overridden with a development command

**Severity:** P0  
**Solution:** Separate `web-dev` and `web-production` targets. Never override an nginx production image with `npm run dev`.

### INFRA-005 — MongoDB is not included or required in the production contract

**Severity:** P0  
**Solution:** Use a managed MongoDB replica set with TLS, backups, indexes, least privilege, and readiness validation. Alternatively operate MongoDB deliberately as part of the stack.

### INFRA-006 — Persistent volume permissions are incomplete

**Severity:** P0  
**Solution:** Create and chown media, downloads, cache, and logs before the API starts. Test actual writes as the non-root runtime user.

### INFRA-007 — Deployment is not immutable or reproducible

**Severity:** P1  
**Solution:** Build images in CI, tag with commit/version, publish digests, deploy exact versions, run migrations/preflight checks, and retain rollback artifacts.

### INFRA-008 — Operations lack observability

**Severity:** P1  
**Solution:** Add structured logs, correlation IDs, metrics, traces where useful, Caddy logs, external uptime checks, disk alerts, CPU/RAM alerts, database alerts, Redis alerts, and worker metrics.

### INFRA-009 — No complete production integration gate

**Severity:** P0  
**Solution:** CI must build containers, start the supported stack, test Caddy, health, authentication, Socket.IO, persistence, range playback, download fixtures, shutdown, and restart recovery.

---

## 4.11 Testing and quality

### TEST-001 — Unit tests do not prove production behavior

**Severity:** P0  
**Solution:** Keep unit tests and add integration tiers:

- Real container startup.
- Real MongoDB test instance.
- Real Redis test instance.
- Controlled HTTP range origin.
- FFmpeg fixture conversion.
- Worker restart.
- Caddy proxy.
- Browser playback.
- Android smoke tests.
- Multi-user authorization.
- Load and soak testing.

### TEST-002 — No complete user-journey tests

**Severity:** P1  
**Solution:** Add Playwright journeys for signup/login, search, play, seek, queue, download, library refresh, reconnect, offline state, account switch, and logout.

### TEST-003 — No capacity target is measured

**Severity:** P1  
**Solution:** Define 500-user scenarios and test realistic mixes of active playback, search, artwork, downloads, WebSocket connections, and cache hits. Record CPU, memory, egress, disk, database latency, and error rate.

### TEST-004 — No security regression suite for ownership

**Severity:** P0  
**Solution:** Add tests proving User A cannot see User B's jobs, events, playlists, history, private media, cache entries, or offline data.

---

## 4.12 SaaS completeness

### SAAS-001 — Account lifecycle is incomplete

Implement:

- Registration and sign-in.
- Email verification and recovery through the identity provider.
- Session expiry and refresh.
- Logout on all devices.
- Account deletion/export.
- Privacy controls.
- Device/session management.
- Terms and privacy acceptance versioning.

### SAAS-002 — Subscription and entitlement model is absent or undefined

If Rheoson will be a commercial SaaS, define an entitlement service before billing UI:

- Plans.
- Limits.
- Trial state.
- Payment provider integration.
- Webhook verification and idempotency.
- Grace period.
- Cancellation.
- Data retention.
- Administrative override.

Do not build payment screens without durable entitlement state.

### SAAS-003 — Product analytics and operational analytics are mixed

Separate:

- Privacy-respecting product events.
- Error and performance telemetry.
- Media-provider metrics.
- Business metrics.

Define retention and consent rules for each.

### SAAS-004 — Support and trust surfaces are incomplete

Add:

- Status page or status endpoint.
- Contact/support route.
- Abuse/report flow.
- Account security notifications.
- Changelog and release notes.
- Public documentation.
- Transparent service limits.

### SAAS-005 — Legal and content rights require explicit treatment

A public music product needs clear policy for content sources, user downloads, provider terms, takedown requests, copyright complaints, privacy, terms, and regional restrictions. This is a product and legal workstream, not only a code task.

---

# 5. Framework and stack evaluation

## 5.1 React/Vite versus Next.js

| Criterion | React + Vite | Next.js | Decision for Rheoson |
|---|---|---|---|
| SPA playback | Simple and predictable | Also possible, but server/client boundaries add complexity | Keep proven player code while migrating gradually. |
| Public SEO | Requires extra SSR/SSG architecture | Built-in server rendering, metadata, sitemap conventions | Next.js is better for public pages and discovery. |
| Routing/layouts | Requires conventions | Strong filesystem routing and layouts | Next.js improves product structure. |
| Server data loading | Client-first | Server and client loading patterns | Useful for public/catalog pages; not a playback cure. |
| Static deployment | Very simple | Can be static or server-backed | Vite is simpler for the current APK/static build. |
| Image/metadata handling | Manual | Better built-in tooling | Next.js advantage. |
| Mobile Capacitor build | Existing path works | Requires validation of export/runtime strategy | Migrate only after testing. |
| Complexity | Lower | Higher | Use Next.js where it creates measurable value. |
| Community | Very large | Very large | Both are safe choices. |
| Migration risk | None currently | Medium/high | Use route-by-route migration. |

**Recommendation:** Move the web product toward Next.js because public SEO, metadata, routing, structured layouts, and public catalog pages are important. Do not treat the migration as the fix for playback, caching, Redis, or workers. Keep the player behind a stable client-side boundary and migrate it last.

## 5.2 Capacitor versus React Native

| Criterion | Capacitor | React Native | Decision |
|---|---|---|---|
| Reuse web UI | Excellent | Low | Capacitor wins for immediate delivery. |
| Native audio | Limited without native plugins | Stronger with native modules | React Native wins if background audio is essential. |
| Filesystem/downloads | Requires platform-specific handling | Stronger native control | React Native advantage. |
| Development cost | Lower | Higher | Capacitor wins initially. |
| App-store quality | Depends on plugins and native work | Strong potential | Decide after core contracts stabilize. |
| Shared design system | Web-first | Separate native implementation | Capacitor wins for one UI. |
| Long-term mobile UX | May need increasing native code | Better native ceiling | React Native may become the long-term choice. |

**Recommendation:** Keep Capacitor during web/API stabilization. Begin React Native only as a separate product track after reliable API, authentication, media, download, and offline contracts exist.

## 5.3 FastAPI versus TypeScript control plane

| Criterion | FastAPI/Python | NestJS/Fastify/TypeScript | Decision |
|---|---|---|---|
| Media integrations | Excellent | Requires subprocess/service integration | Keep Python for media. |
| API performance | Strong | Strong | No automatic winner. |
| Shared frontend language | No | Yes | TypeScript advantage. |
| Existing implementation | Already built | Requires migration | FastAPI advantage now. |
| Team productivity | Depends on team | Depends on team | Use the team's strongest language. |
| Worker integration | Native Python | Queue boundary required | Python worker remains. |
| Migration risk | None | Medium/high | Migrate only after durable boundaries exist. |

**Recommendation:** Keep FastAPI through stabilization and worker extraction. Consider a TypeScript control plane later without rewriting the Python media domain.

## 5.4 MongoDB versus PostgreSQL

MongoDB is acceptable for the current flexible catalog, user preferences, signals, and recommendation data. PostgreSQL becomes attractive if subscriptions, entitlements, billing, financial events, reporting, strict relational constraints, and complex transactional workflows become central.

Do not migrate databases solely because another stack uses PostgreSQL or MySQL. Decide from data relationships and operational requirements.

## 5.5 Redis

Redis is recommended, but only as a real subsystem:

- Queue and job coordination.
- Distributed locks.
- Rate limiting.
- Socket.IO pub/sub.
- Single-flight stream fills.
- Short-lived cache metadata.
- Leader election.

Do not store the primary audio library in Redis.

## 5.6 Kubernetes and load balancers

Kubernetes and standby load balancers are not immediate requirements for 500 users. First operate a hardened single-host Compose deployment with managed MongoDB, managed Redis, persistent storage, monitoring, backups, and tested workers.

Design the contracts so that additional API or worker replicas can be added later. Do not pay the operational cost of Kubernetes before the measured workload requires it.

---

# 6. Feature development while fixing the platform

Feature work continues through parallel lanes.

## Lane A — Reliability foundation

Playback, authentication, ownership, caching, jobs, deployment, workers, monitoring, and tests.

## Lane B — Product experience

Search, library, playlists, recommendations, onboarding, visual design, accessibility, notifications, sharing, and account experience.

## Lane C — Growth and discovery

Public pages, metadata, sitemap, robots policy, landing pages, structured data, social previews, analytics, referrals, and documentation.

## Lane D — Platform expansion

Next.js migration, React Native evaluation, object storage, provider adapters, subscriptions, and internationalization.

Lanes B–D may add features, but they must not bypass Lane A contracts. For example:

- A new download feature must use durable owner-scoped jobs.
- A new public page must use canonical metadata and indexation rules.
- A new cache must declare TTL, scope, invalidation, and size policy.
- A new provider must use timeouts, quotas, retries, and metrics.
- A new mobile feature must declare foreground/background and offline behavior.

---

# 7. Implementation sequence

## Release 1 — Product can boot and be trusted

- One supported production Compose topology.
- Correct Caddy routing.
- Real readiness checks.
- Correct MongoDB configuration.
- Correct persistent permissions.
- Authentication and user isolation.
- Private Socket.IO rooms.
- Download ownership.
- Version alignment.
- SEO foundation for the public landing site.

## Release 2 — Playback is reliable

- One player engine.
- Correct range behavior.
- No unsafe partial audio cache.
- Query invalidation and library refresh.
- Visible player states.
- Browser end-to-end tests.
- Android playback baseline.

## Release 3 — Downloads are durable

- Durable job records.
- Real queue.
- Worker supervision.
- Cancellation and restart recovery.
- Atomic artifacts.
- Quotas and disk limits.
- Download progress recovery.

## Release 4 — Caching and search are real

- Real Redis integration.
- Distributed rate limits.
- Stream single-flight.
- Cache metrics and cleanup.
- Search result cache.
- Local library index.
- Provider timeouts and circuit behavior.

## Release 5 — SaaS and public product quality

- Next.js public/catalog migration.
- Sitemap and robots policy.
- Metadata and structured data.
- Public artist/album/track pages.
- Support, status, privacy, terms, and account controls.
- Analytics and Core Web Vitals.
- Subscription/entitlement design if commercial billing is planned.

## Release 6 — Scale and platform expansion

- Real 500-user load testing.
- Worker scaling.
- API replica readiness.
- Object storage if required.
- React Native decision based on native audio requirements.
- TypeScript control-plane decision based on measured team/product benefit.

---

# 8. Definition of done for a production feature

A feature is complete only when it includes:

1. User story and supported states.
2. Authentication and ownership policy.
3. API contract and validation.
4. Loading, success, empty, offline, retry, and failure states.
5. Cache policy and invalidation behavior.
6. Mobile behavior.
7. Analytics/observability events where appropriate.
8. Unit tests.
9. Integration tests.
10. Browser or mobile journey tests when user-facing.
11. Accessibility review.
12. Documentation written as product/system documentation, not internal conversation notes.
13. Deployment and rollback considerations.

---

# 9. Documentation standard

Documentation must describe the finished system and its operating rules.

It must not contain:

- Conversation transcripts.
- “The user asked for...” notes.
- AI messages to the creator.
- Private brainstorming history.
- Unresolved implementation promises presented as facts.
- Stale architecture diagrams.

Required documentation set:

- Product overview.
- Architecture.
- API reference.
- Authentication and authorization.
- Playback and streaming.
- Downloads and workers.
- Caching.
- Data and storage.
- Web and SEO.
- Mobile.
- Deployment.
- Operations.
- Security.
- Privacy and terms.
- Development and contribution guide.
- Release and migration notes.
- Status matrix showing implemented, partial, planned, and removed features.

Every document must state its last update date and link to the authoritative implementation or contract.

---

# 10. Final architecture decision

Rheoson should evolve into:

- **Next.js for the public and web product shell**, migrated gradually from React/Vite.
- **React/TypeScript components retained where they are proven**, especially while playback is stabilized.
- **FastAPI retained initially as the control plane**, with a future TypeScript control-plane option.
- **Python workers for yt-dlp, FFmpeg, mutagen, providers, and media operations.**
- **Real Redis for queueing, locking, rate limiting, pub/sub, and cache coordination.**
- **MongoDB initially for durable application state**, with PostgreSQL evaluated if commercial transactional features require it.
- **Persistent media storage initially**, with object storage/CDN introduced when measured scale requires it.
- **Capacitor initially**, with React Native evaluated for native background audio and filesystem requirements.
- **Docker Compose and Caddy initially**, with no Kubernetes until operational evidence justifies it.

This is not a choice between “keep the old stack” and “rewrite everything.” It is a controlled transformation in which each migration is tied to a real product requirement.

The destination is a product with reliable playback, durable downloads, actual caching, secure multi-user behavior, public discoverability, measurable performance, strong mobile behavior, and an architecture that can grow without turning every new feature into a system-wide regression.

---

# References

[1]: https://nextjs.org/docs "Next.js documentation"
[2]: https://react.dev/ "React documentation"
[3]: https://vite.dev/guide/ "Vite documentation"
[4]: https://reactnative.dev/docs/getting-started "React Native documentation"
[5]: https://capacitorjs.com/docs "Capacitor documentation"
[6]: https://fastapi.tiangolo.com/ "FastAPI documentation"
[7]: https://redis.io/docs/latest/develop/ "Redis documentation"
[8]: https://docs.docker.com/compose/ "Docker Compose documentation"
[9]: https://ffmpeg.org/documentation.html "FFmpeg documentation"
[10]: https://github.com/yt-dlp/yt-dlp "yt-dlp documentation"
[11]: https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview "Google sitemap documentation"
[12]: https://developers.google.com/search/docs/crawling-indexing/robots/intro "Google robots.txt documentation"
[13]: https://schema.org/ "Schema.org structured data vocabulary"
[14]: https://web.dev/articles/vitals "Web Vitals documentation"
