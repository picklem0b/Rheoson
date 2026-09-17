# Practical Debugging — Finding Out Why

*Stage 11. Debugging is not a talent; it's a loop: **reproduce → read → hypothesize → test the hypothesis → fix → prove the fix**. This page teaches the loop with this repo's actual tools, then gives you broken code to practice on.*

## 1. Reading an error message (the whole skill in miniature)

```
TypeError: Cannot read properties of undefined (reading 'name')
    at LibraryTrackRow (LibraryTrackRow.tsx:71:33)
```

Four facts, in order: **what** (TypeError — a value was used wrong), **why** (something is `undefined` and you read `.name` on it), **where** (file:line:column), **when** (during render of that component). Beginners read error bottom-up and panic; do the opposite: line 1 tells you the kind of problem, the stack tells you the path that led there. The real bug this message pointed at in this repo: `track.artist.name` when a cached track had no artist — fixed by `track.artist?.name ?? 'Unknown Artist'`.

**Rules:** never fix by deleting the line that crashed. Understand which value was undefined and *why it could be* — that knowledge is the fix.

## 2. Finding the source of a frontend error

1. Reproduce with devtools open (Chrome `F12`; on the APK, `chrome://inspect` from a desktop Chrome — `webContentsDebuggingEnabled` is on in dev builds).
2. **Console** — the error + stack. Click the file:line to jump into source (sources are readable even in prod builds).
3. **Network tab** — every API call: status (401? 404? 500?), payload, response body. Half of "the app is broken" is "an endpoint returned something unexpected" — this tab shows it.
4. Add a temporary log at the suspect line: `console.log('tracks:', localTracks)` — then remove it before committing (lint will remind you).

## 3. Debugging the backend

```bash
# structured logs are the backend's memory
tail -f /tmp/api.log | grep stream
# every line carries request_id — correlate a failure to its request
```

- FastAPI errors print a Python **traceback** — read the *last* line first (the actual exception), then walk up to the first frame in *your* code.
- Add temporary output with the project's logger, not print:
  ```python
  log.warning("download.failed", track_id=track_id, error=str(e))
  ```
- Interactive: `breakpoint()` on a line → the process pauses there and you can inspect variables (`p job`, `c` to continue). Remove after.

## 4. Debugging API requests

```bash
curl -s -X POST http://127.0.0.1:8000/api/downloads \
  -H "Content-Type: application/json" \
  -d '{"trackId":"dQw4w9WgXcQ"}' -w "\nHTTP %{http_code}\n"
```

Bisect the chain: does the endpoint work from curl (→ the bug is frontend) but fail from the app (→ inspect the exact request in the Network tab)? A JSON body where HTML came back is its own diagnosis: the request hit the wrong server (the repo shipped that bug once — `apiTarget.ts` exists because of it).

## 5. TypeScript errors

```
error TS2339: Property 'isDownloded' does not exist on type 'Track'.
  Did you mean 'isDownloaded'?
```

TS errors are *helpful* — read the "Did you mean" and the referenced type. Strategy: fix the **first** error, re-run; later errors are often cascade noise. `npx tsc --noEmit` is your loop; it's also a CI gate, so never commit red.

## 6. Build errors

`npm run build` failing usually means: TS error (see §5), a broken import (read the "Module not found" path — typo? wrong alias?), or a bad env (`verify-api-base.mjs` fails when the bundle lacks an absolute API origin — read the script, it tells you what to set).

## 7. Test failures

```
FAILED tests/test_guest_policy.py::test_account_endpoints_refuse_anonymous[…]
AssertionError: assert 200 == 401
```

Three possibilities, in order of likelihood: **(1)** your change broke a pinned behavior — read the test name; it's a sentence describing the rule; **(2)** the test is stale (the *policy* changed — update the test *and* say why in the commit, like `test_auth_guard.py` did when guest mode was restored); **(3)** test isolation leaked state — clear caches/order-dependent fixtures. Run the failing test alone before theorizing: `pytest tests/test_guest_policy.py -q`.

## 8. Dependency problems

```bash
npm ls howler                 # who depends on what version
rm -rf node_modules && npm i  # the classic reset (locks match package.json)
cd api && uv lock             # re-resolve python deps after pyproject edits
```

If a fresh clone fails while your machine works, it's usually a lockfile drift: commit `uv.lock`/`package-lock.json` changes together with `pyproject`/`package.json`.

## 9. Runtime errors in production (the browser-only kind)

The project logs client errors (`lib/logger.ts`) and surfaces "Backend returned HTML instead of JSON" as a *symptom*, not a cause. The cause-finding order: reproduce → network tab → which origin did the build bake in (`npm run verify`)? → env parity between dev and prod. This exact class was this repo's worst historical bug; the case study is in [15-code-patterns](../15-code-patterns/patterns.md).

## 10. Practice — find and fix (real broken code, escalating)

Fix each in a scratch branch; run the gates; revert. Solutions are below each — attempt first.

**Bug 1 (syntax/typo).**
```ts
const downloadedCount = useMemo(
  () => localTracks?.filter(t => t.isDownloded).length ?? 0,
  [localTracks]
)
```
▶ `tsc` fails with TS2339 and offers the correction. Lesson: the compiler is the fastest debugger for typos.

**Bug 2 (logic).**
```ts
const recentDone = completedJobs.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
```
Tests pass; the UI shows oldest-first despite the name `recentDone`. Two bugs: sort mutates the store's array, and the comparison is ascending. Fix: `[...completedJobs].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))`. Lesson: read names as contracts; watch for in-place mutations of store arrays.

**Bug 3 (async).**
```ts
const results = searchApi.search(q)
setResults(results)
```
▶ `results` is a Promise — `setResults` stores an unresolvable object; the UI renders garbage. Fix: `await` (and the function becomes `async`). Lesson from [01 §9](../01-programming-basics/variables-functions-data.md): every API call is awaited.

**Bug 4 (auth/policy).**
```python
@router.get("/recently-played")
async def get_recently_played(user: dict = Depends(get_current_user)):
```
Guests get 401 — violates the guest matrix. Fix: `user: dict | None = Depends(get_optional_user)` and handle `user is None`. Lesson: endpoint auth is a *policy decision*, pinned by `test_guest_policy.py`.

**Bug 5 (the silent one).**
```ts
useEffect(() => {
  ws.on('download:progress', onProgress)
}, [])
```
▶ Missing cleanup: remounts stack duplicate handlers → progress jumps erratically. Fix: return `() => ws.off('download:progress', onProgress)`. Lesson: every subscription has an unsubscription; the registry in `websocket.lib.ts` dedupes but never replaces your cleanup duty.

## Exercises

1. Intentionally break `formatDuration` (swap `floor` for `round`) and write the test that catches it *before* running the suite. Did the existing tests catch it? Why/why not?
2. Open the Network tab, search something, find one request. Read its status, payload and response shape. Compare with the TS type it's parsed into (`api-generated.ts`).
3. Run `npx tsc --noEmit` on a scratch branch where you renamed a store field. Trace the error list — that's every consumer. This is the fastest codebase-navigation trick you'll learn.
