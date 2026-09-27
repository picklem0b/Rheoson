# Phase 7 — Adversarial review

> Phase 7 of 8 · Owner: GPT-6 Luna + GLM 5.3 Flash sessions (recorded here)
> Method: attack the *claims*, not the code. For each area ask "what would have
> to be true for this to be wrong?", then look for that.
> Every finding below is either **fixed in this branch** or **filed** with the
> reason it is not.

## 1. Security

### F1 — The engine trusts its own network, and that network is one container wide (accepted)

`ENGINE_TOKEN` unset means the engine accepts anyone who can reach it; the same
is true of the relay and of a tokenless internal events route. In compose they
are on an internal network with no published ports beyond the host's own.
**Judgement:** correct for the stated deployment, and wrong the moment someone
publishes `8081` to the internet — which the compose file does (`ports:`), for
developer convenience.
**Fix applied:** `infra/.env.example` states that the tokens must be set in any
shared deployment, and `engine.service.ts` always sends the token when one is
configured. **Filed:** publishing the engine's port is a host-level decision;
the deployment doc in `03-spec.md` §8 tells the reader to keep it internal.

### F2 — Web Audio can silence playback instead of failing (fixed)

Connecting an `<audio>` element to a `MediaElementAudioSourceNode` puts it in
CORS mode: without usable `Access-Control-Allow-Origin` the element produces
**silence**, and no error event fires. Setting `crossOrigin="anonymous"` on
every track would have made the entire app depend on the API's CORS headers
being right — a silent, total failure.
**Fix:** the graph is opt-in. Default playback is a plain `<audio>` element;
`crossOrigin` is only set the first time a listener enables an effect, and the
current track reloads at that moment so a failure is loud.
**Residual:** the first enable still requires working CORS. It is a documented,
explicit action rather than a hidden precondition.

### F3 — An artwork route that fetches a URL is SSRF (fixed by design)

The naive implementation proxies whatever URL it is given. Here the client can
only name a *track id*: the engine maps it to a file on disk, and
`/api/tracks/:id/artwork` relays bytes. There is no path where a client-supplied
host reaches `fetch`.

### F4 — Download jobs are an authorization surface (verified)

Three layers, each tested: the client cannot name an owner (the server attaches
it from the session), the engine scopes every read/mutation by that header, and
a job belonging to someone else answers `DNF01` — "not found", never
"forbidden", so the response does not confirm the job exists.

### F5 — Path traversal through a track id (fixed by construction)

A track id reaches a path lookup and, historically, a subprocess argument.
`isTrackId` (`^[A-Za-z0-9_-]{1,64}$`) is applied at the API, again at the
engine, and the engine's file lookups go through the identity map rather than a
constructed path. Tested with `..%2F..%2Fetc%2Fpasswd` on every track route.

### F6 — A malformed request body must not become a 500 (verified)

Every route parses with zod and raises a coded 400; the internal events route
requires a service token and a well-formed body. An unparseable body is
`DVA03`/`EVA07`/`RVA03`, never an unhandled exception.

## 2. Correctness

### F7 — "The playing track appears twice in the queue" (fixed)

This was a real bug in the current stack. Here `nowPlaying()` and `upNext()` are
views of one list, so a duplicate is not representable, and the test asserts it
by id.

### F8 — A resumed download could restart from zero (verified)

The contract is `--continue` plus a per-job staging directory that survives
failure. The test proves the arithmetic: 4 staged bytes + 4 appended = 8. A
restart would have produced 4.

### F9 — Resumability could lie (fixed)

`resumable`/`stagedBytes` are derived from disk at read time, never stored. A
stored flag disagrees with the filesystem after a crash, and a UI offering
"resume" for bytes that are gone is worse than one offering nothing.

### F10 — A failed download could show unhelpful copy (fixed)

This is the defect that motivated the whole error-code effort. A failure now
carries `DEX01` **and** the tool's own last words, and the toast's ⓘ reveals
them verbatim. Summarising the reason was the original sin; the code forbids it.
**Residual:** the engine's classification is a marker list. A new YouTube
refusal phrasing produces `DEX01` with the raw message — accurate, but not yet
categorised. That is the honest failure mode: a new code is added when the
message is understood, not guessed at now.

### F11 — Cross-test state could hide real bugs (found, then fixed twice)

Two genuine defects were exposed only because tests are hermetic: a job
resolving its data directory per step (F11a) and a library cache not keyed by
its root (F11b). Both are recorded in `06-test-report.md` §3. Neither would have
surfaced in production, where the environment never changes mid-process —
which is precisely why they are worth fixing rather than tolerating.

### F12 — Requests can reply on a stale search (fixed)

Search results are keyed by the query that produced them and out-of-order
responses are discarded, so typing quickly cannot render the previous query's
results.

## 3. Performance

### F13 — A whole track in memory per listener (avoided)

`/stream` pipes rather than buffers; the relay copies through a 64 KB buffer and
flushes per chunk. Range requests are never buffered into the cache — only
whole-file responses are eligible for the tee, promoted by rename so a reader
can never observe a truncated entry.

### F14 — Health probes stampeded (fixed earlier, still true)

Concurrent requests for a struggling service used to each open their own probe.
Probes are now memoised *and* coalesced, and a relay that probes healthy but
cannot serve a track falls through rather than surfacing (un-mirrored).

### F15 — Client re-render on every playback tick (fixed)

`timeupdate` fires about four times a second; position writes are throttled to
~250 ms and consumed by two components. Local-cache-first loading is what makes
seeking instant.

### F16 — IndexedDB quota is finite (handled)

Entries above 12 MB are refused, an eviction pass runs oldest-first past 400 MB,
partial (206) responses are never cached, and every cache failure is swallowed
because a cache must never be the reason a track does not play.

## 4. Assumptions that do not hold

| Assumption | Reality | Consequence |
| --- | --- | --- |
| "The device has a pointer" | mobile is primary | every control is a real button with a label; the ⓘ panel works on touch and keyboard; nothing is hover-only |
| "YouTube will keep behaving" | it breaks regularly | the engine's client ladder is evidence-based, `yt-dlp` is updatable, and the failure names the reason |
| "One process is enough" | true until it is not | ADR-9: Redis is in compose and unused; the bus's publish/subscribe surface is the seam |
| "Clerk keys exist" | they do not in this environment | ADR-10: the client's session is an interface with a dev provider; the server fails closed outside development |
| "A downloaded track is still a search result" | it is, but only because the identity map says so | `isDownloaded` is read from the map, never inferred from a title match |

## 5. Things this review did not do

* **No penetration test.** The findings above are reasoning about the code, not
  a live attack.
* **No load test.** The two-tier stream path, the probe TTL and the coalescing
  are argued from their shape; no measurement is claimed.
* **No browser-level accessibility audit.** The error page and the toast host
  use real disclosure controls with labels and focus behaviour and are
  unit-tested; an audit with a screen reader has not been run.
* **No third-party dependency audit** beyond what CI's install already implies.

## 6. Verdict

No blocking findings. Two residual risks are recorded (F1 port exposure when
someone publishes an internal service; F10 an uncategorised refusal phrasing),
both with the honest failure mode stated rather than a promise. The findings
that were architectural — F2 above all — changed the design rather than being
worked around, which is the outcome this phase exists to produce.
