# Variables, Functions & Data — Deeper

*Stage 1. Builds on [00](../00-start-here/what-is-programming.md), now with real code from the repository.*

## 1. Constants vs variables, and why `const` wins here

```ts
// web/src/lib/constants.ts (abridged)
export const APP_VERSION = "2.17.10";
export const STORAGE_KEYS = { volume: "rheoson-volume" } as const;
```

`const` binds a *name* to a value forever (the value itself can still be an object whose *contents* change). `let` allows reassignment. This codebase uses `const` for ~95% of declarations because knowing a name never changes makes code easier to reason about. When you review code, treat `let` as a signal: "the author expects this value to change" — and check that it actually does.

**Recognize in review:** `const x = ...` → stable binding. `let x = ...` → watch where `x` is reassigned. Anything else (`var`) is outdated — flag it.

**Practice:** find one `let` in `web/src/lib/audioCacheMigration.ts` and explain what changes between its assignment and its last use.

## 2. Functions with parameters and return values

```ts
// web/src/lib/formatters.ts (real)
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
```

Reading the signature tells you the contract without reading the body:
- in: one `number` (seconds)
- out: one `string` (`"3:33"`)

Two details worth learning early:

1. **`Math.floor(seconds % 60)`** — `%` is the *remainder* operator. `213 % 60` is `33` (213 seconds = 3 full minutes + 33 seconds). Remainder is how everyone converts "total seconds" into "minutes and seconds".
2. **Template strings** — `` `${m}:${s}` `` builds a string by inserting values. The backtick `` ` `` (not a quote) starts it.

**Practice:** what does `formatDuration(3725)` return? Trace it: `3725 / 60 = 62.08…` → floor → `62`. `3725 % 60 = 5` → `"5".padStart(2, '0')` → `"05"`. Result: `"62:05"`.

## 3. Objects — grouping related values

```ts
// web/src/types/track.types (shape)
{
  id: "dQw4w9WgXcQ",
  title: "Never Gonna Give You Up",
  artist: { id: "UCuAX…", name: "Rick Astley" },   // nested object
  isDownloaded: false,
}
```

You read a property with a dot: `track.title`. You can read two levels: `track.artist.name`. The *optional chain* (`track.artist?.name`) — covered in [02](../02-javascript/fundamentals.md) — is how this codebase avoids crashes when `artist` is missing (that exact crash broke the My Music page once; the fix was defaulting to `'Unknown Artist'`).

## 4. Arrays — lists and their most-used operations

```ts
const tracks = [trackA, trackB, trackC]
tracks.length          // 3 — how many
tracks[0]              // trackA — first item (counting starts at 0!)
tracks.push(trackD)    // add to the end — the queue does this on "play next"
```

A queue is just an array plus rules. From `web/src/store/queue.store.ts`:

```ts
// (abridged) the upcoming queue; the currently playing track is the
// last item of `history`
queue:    Track[]
history:  Track[]
```

`next()` takes the first item off `queue`; `prev()` pops from `history` and pushes the current track back onto the front of `queue`. Once you see arrays as "the queue is the front, history is the back," the whole store becomes readable.

**Practice:** open `web/src/store/queue.store.ts` and find `next()`. In one sentence: when `queue` is empty and repeat is off, what happens? Find the lines that prove it.

## 5. Conditions in the wild

```ts
// pattern: guard clause — leave early when the unusual case is true
if (!track) return null
// ...normal path continues below
```

This codebase prefers *guard clauses* (return early on the weird case) over nested `if/else` pyramids, because the happy path stays un-indented and readable. When reviewing, indentation depth is a smell: more than two levels usually means a guard clause is missing.

`switch` appears where one value has several discrete cases (player repeat modes):

```ts
switch (repeatMode) {
  case 'one':  replayCurrent();      break
  case 'all':  startQueueFromTop();  break
  default:     stopPlayback()
}
```

## 6. Loops — and why you'll mostly see `.map()` instead

A plain loop:

```ts
for (const job of jobs) {
  console.log(job.title)
}
```

But the codebase overwhelmingly uses array methods, which *return new arrays* instead of mutating (see [02](../02-javascript/fundamentals.md) for `map`/`filter`). Plain `for...of` still appears where the goal is *doing* something per item rather than *producing* something — e.g. cleanup loops in tests:

```ts
// api/tests/conftest.py is Python, but the web tests do the same shape:
for (const f of files) os.unlink(f)      // python: os.unlink(f)
```

**Recognize in review:** `for...of` → side effects per item (delete, send, log). `.map()` → build a new list from the old one. Choosing the wrong one is a classic beginner bug.

## 7. Imports and exports — sharing code between files

Every file is a **module**. `export` makes a thing importable; `import` uses it:

```ts
// web/src/lib/utils.ts
export function cn(...inputs: ClassValue[]) { ... }

// web/src/pages/downloads/Downloads.tsx
import { cn } from '@/lib/utils'
```

The `@/` prefix means "from `web/src/`" — a shortcut configured in Vite so nobody writes `../../..` chains. When you review a file, its import block is the table of contents: it tells you what the file depends on before you read a line of logic.

Two export shapes to distinguish:

```ts
export function cn() {}       // named export — import { cn } from ...
export default class ErrorBoundary {} // default — import ErrorBoundary from ...
```

## 8. Errors — what happens when things go wrong

```ts
try {
  const job = await downloadsApi.startDownload(payload)
} catch (e) {
  // the network failed, the server said no, the track didn't exist…
  updateJob(tempId, { status: 'error', error: e.message })
}
```

`try` wraps code that might fail; `catch` receives the failure as a value and decides what to do. Rheoson's rule of thumb: **user actions catch and show a message; startup code catches and degrades gracefully; programmer mistakes (typos, bad calls) are not caught — they should crash in development so you notice.**

The backend has the same concept in Python (`try/except`), and the HTTP layer turns exceptions into status codes: a missing track becomes `404`, a bad request becomes `400`, an expired login becomes `401` (see [06](../06-backend/api-guide.md)).

## 9. Async — the idea that unlocks this whole codebase

Music streaming is full of waiting: network requests take hundreds of milliseconds, file scans take seconds. If the program *stopped* while waiting, the app would freeze on every tap. Instead, operations that wait are marked **`async`** and you **`await`** their result:

```ts
const results = await searchApi.search('adele')   // wait here, without freezing the UI
console.log(results.songs)
```

Under the hood this is **promises** — an object representing "a value that will exist later." `await` means "pause this function until the promise settles." The full treatment (and the `.then()` style you'll see in older code) is in [02](../02-javascript/fundamentals.md); for now, memorize one rule:

> **Every API call in this codebase is awaited.** If you see a function doing `api.get(...)` without `await`, that's a bug candidate.

## 10. Putting it together — a real trace

`Downloads.tsx` (the My Music page) counts downloaded tracks:

```ts
const downloadedCount = useMemo(
  () => localTracks?.filter(t => t.isDownloaded).length ?? 0,
  [localTracks]
)
```

Every concept from this page appears in five lines: `const`, an **array method** (`filter`), a **property read** (`t.isDownloaded`), **optional chaining + nullish coalescing** (`?.` and `?? 0` — "if there are no tracks, count is 0"), and a dependency list that tells React when to recompute. You can't read one line of this file without all of stage 1. That's why the order of this course is the order it is.

## Exercises

1. Write (on paper or in a scratch file) a function `formatCount(n)` that returns `"1 track"` for 1 and `"3 tracks"` otherwise. Then look at how the My Music header does the same pluralization inline.
2. In `web/src/lib/constants.ts`, find `STORAGE_KEYS`. Why is it an object of constants instead of strings scattered through the code? (Hint: what happens when someone typos a key in one place?)
3. Trace: what happens, function by function, when you tap play on a track that is already on disk? Start at `LibraryTrackRow.handlePlay` and follow the imports. You won't understand everything — write down the three files you pass through.
