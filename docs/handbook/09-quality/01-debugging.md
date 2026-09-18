# Chapter 15 — Debugging

*Part IV · Engineering Practice*

---

Debugging is the skill this handbook has been building toward, because it is the skill that converts every other chapter from theory into practice. The good news: debugging is a *method*, not a talent. This chapter gives the method, then the techniques per layer, then worked exercises with deliberately broken code to fix.

## 15.1 The method

Every effective investigation is the same five moves:

1. **Reproduce it reliably.** An intermittent bug is a hypothesis generator; a deterministic one is an equation to solve. Before anything else, find the minimal sequence that makes it happen every time.
2. **Read the actual error.** All of it. The message, the file, the line, the trace. Most debugging sessions fail here — the error was skimmed, not read.
3. **Form one hypothesis.** "The 401 comes from the expired token, not the route" is a hypothesis. "Something's wrong with auth" is a mood.
4. **Test it cheaply.** One log line, one breakpoint, one curl. The cheapest test that could prove the hypothesis wrong.
5. **Fix the cause, not the symptom.** Guarding the crash site feels faster; the bug merely moves. Ask "why did this value get here like that?" one layer deeper than where it exploded.

The discipline that separates professionals: at every step, the current belief is written down (even as a comment) and the next test can only confirm or kill it. Debugging by randomly changing things feels active and reliably wastes hours.

## 15.2 Reading error messages

Three message shapes cover most of what this codebase produces:

**A stack trace** (backend, and uncaught frontend errors) reads innermost-last-up: the *bottom* frame is where execution started, the *top* frame is where it failed, and the frames between are the path. Skip library frames; the first frame in project code (`api/app/...`, `web/src/...`) is usually where to look first.

```
Traceback (most recent call last):
  File "app/routers/track_router.py", line 88, in get_track     ← path
  File "app/services/track_service.py", line 41, in hydrate     ← path
KeyError: 'album'                                              ← the failure
```

**A TypeScript compile error** names two types that disagree. Read *both* sides: `Type 'string | undefined' is not assignable to type 'string'` means "something may be absent and this site does not handle it" — the fix is at the boundary that produced the value (5.3), not a cast at the use site.

**A network error in the browser** is best read in the DevTools Network tab: status code, response body, request headers. "Backend returned HTML instead of JSON" — this project's most instructive bug — was invisible in code and obvious in one glance at a response's `Content-Type`. The browser's console and network tab are the first two tools for anything user-visible; code is the third.

## 15.3 The error taxonomy, revisited

Chapter 1.5's three classes now get their debugging procedures:

- **Syntax/build errors** — the process never started. Fix the named file and line; nothing else can be investigated yet. Vite and `tsc` output names file and character; trust them.
- **Runtime exceptions** — the trace above. Find the first project frame; check the value it touched.
- **Logic errors** — no error anywhere, wrong output. The hardest class, and the reason tests exist (16.2): a failing test is a logic error converted into a runtime one. Bisect the data flow — put a log where the value is produced, where it is transformed, where it is consumed; the bug is between the last good and first bad log.

## 15.4 Debugging the frontend

Tools, in the order they usually pay off:

**Console and breakpoints.** `console.log` with a *label and the whole object* (`console.log("queue after next:", queue)`) is fine; the debugger is finer — DevTools sources panel, or a `debugger;` statement. Conditional logging in effects: log *inside* the effect, not in render, or the log stream lies by volume.

**React state.** The React DevTools extension shows component trees and live props/state — the fastest answer to "why does this row think it's playing?"

**Store state.** Zustand stores are inspectable by logging in a subscriber; the codebase's stores are small enough that `usePlayerStore.getState()` from the console answers most state questions directly.

**Network.** Every API call: status, payload, timing. Abort and retry behavior is visible here too — a request that fires twice on one click is a missing dedup or an effect with the wrong dependencies (7.4).

## 15.5 Debugging the backend

**Logs.** The backend logs structured JSON (structlog) — fields, not prose — so `grep` and pipes (13.2) work. Dev runs it in the foreground: the log is the terminal. For a request that misbehaves, find the request line, then read *downward* — causality in a log is chronological.

**A temporary probe.** The backend equivalent of a breakpoint:

```python
import logging; log = logging.getLogger(__name__)
log.warning("hydrate got id=%r liked=%s", track_id, track.get("is_liked"))
```

Level `warning` so it is unmissable in dev, and *remove it after* — a probe that ships becomes noise, and noise is why real warnings get ignored.

**The isolated experiment.** Services are importable without HTTP (9.2's layering exists for this):

```bash
cd api && uv run python - <<'PY'
import asyncio
from app.services import search_service
print(asyncio.run(search_service.search("ray charles")))
PY
```

If the service misbehaves alone, the bug is in the service; if it behaves, the bug is in the layer above — either way, half the search space is gone. This is the single most underused move in backend debugging.

## 15.6 Debugging across the boundary

Most real bugs live *between* layers. The procedure that finds them:

1. **Classify by symptom**: wrong data → backend; right data, wrong pixels → frontend; nothing at all → network or the API target (3.8's dev-proxy/prod-URL split is the first suspect in prod-only failures).
2. **Pin the boundary**: curl the endpoint and compare its JSON to what the frontend logged receiving. Identical → frontend bug. Different → backend bug. The curl itself fails → backend down, wrong port, or wrong URL — three different causes, one test.
3. **Watch the contract**: schema drift (a renamed field) shows up as `undefined` in the frontend and as nothing at all in the backend log — generated types (5.6) exist so this fails at build time, not in production.

The device adds one more layer: `chrome://inspect` for the WebView and `adb logcat` for the native side (12.6). The same classification applies — if the browser reproduces it, the shell is innocent.

## 15.7 Worked debugging exercises

Fix each in a scratch copy; solutions and reasoning follow the separator.

**Exercise A — the vanishing update.** A contributor reports: "after liking a track, the like button un-fills after a second."

```tsx
const [liked, setLiked] = useState(track.isLiked);
useEffect(() => { setLiked(track.isLiked); }, [track]);
async function toggle() {
  setLiked(!liked);
  await tracksApi.like(track.id);
}
```

**Exercise B — the slow search.** Four searches take four seconds total. The code:

```ts
const songs = await searchSongs(q);
const albums = await searchAlbums(q);
const artists = await searchArtists(q);
const playlists = await searchPlaylists(q);
```

**Exercise C — the 404 that isn't.** `GET /api/tracks/liked` returns a track-not-found error. The router registers, in order: `@router.get("/{track_id}")` … then `@router.get("/liked")`.

---

*Solutions*

**A**: Two bugs. The `useEffect` on `[track]` resets local state when the parent re-renders with a new (stale-cache) track object — the server's old `isLiked` overwrites the optimistic flip. And the mutation never updates the cache. Fix: don't mirror server state locally; drive the UI from the query cache and perform the like as a mutation that patches the cache optimistically (8.4's flow). The deeper lesson: *duplicating store state in component state* creates two sources of truth that will disagree.

**B**: Serialized independent work — 4.9's named anti-pattern. `Promise.all` of the four, or per-query rendering. Four seconds to one, and the diagnosis ("each await waits for the previous") is visible in the Network tab as four staggered request starts.

**C**: Route order (9.2's documented bite). `liked` matches `/{track_id}` first, so the "track" `"liked"` is looked up. Fix: register the static route first. The general form: when a literal path collides with a parameter path, order decides — and the test suite pins it so reordering cannot regress silently.

## Exercises

1. Take the three-step curl procedure in 15.6 and apply it to one real endpoint while the dev stack runs. Record which layer you'd have opened first.
2. A user reports "downloads stall at 82%." Using 9.6's pipeline, write the hypothesis chain: three suspects in order, with the one cheap test that discriminates each.
3. Find one `console.log` in the codebase (there should be none shipped — if you find one, that's the exercise: remove it and say what CI gate would have caught it).
4. Reproduce Exercise C's route-order failure in a scratch branch, then fix it. What test would you add to prevent the regression?
5. Write the five moves of 15.1 from memory, then apply all five to the next bug you encounter — in writing.
