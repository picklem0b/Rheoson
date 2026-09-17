# JavaScript / TypeScript Fundamentals — The Codebase Dialect

*Stage 2–3. The frontend (`web/`) is written in **TypeScript** — JavaScript plus a type layer. Files ending in `.ts` hold logic; `.tsx` files also contain JSX (UI markup). This page teaches the exact patterns used here, each as: tiny example → real repo example → how to recognize it → practice.*

## 1. Variables and types

```ts
const title: string = 'Adele'
let plays = 0              // type inferred as number — no annotation needed
const isLiked: boolean = false
```

TypeScript's job: catch mistakes *before the app runs*. `plays = "many"` is an error. In this codebase most annotations are omitted where the type is obvious, and written where it isn't — function signatures, object shapes, API responses.

**Recognize:** `: string`, `: number`, `: Track[]` after a name = annotation. No annotation = inferred. Both are fine; sudden `any` is a smell.

## 2. Functions and arrow functions

Two spellings of the same idea:

```ts
// function declaration
function formatDuration(seconds: number): string { ... }

// arrow function (dominates this codebase)
const formatDuration = (seconds: number): string => { ... }
```

Arrows shine as *inline* callbacks — small functions handed to other functions:

```ts
// real, from web/src/pages/downloads/Downloads.tsx
const filteredTracks = localTracks.filter(t =>
  t.title.toLowerCase().includes(q) ||
  (t.artist?.name ?? '').toLowerCase().includes(q)
)
```

`t => ...` is an arrow taking one track and returning a boolean: *keep this row?*

## 3. Objects, arrays, destructuring

**Destructuring** pulls fields out in one line:

```ts
// real, from web/src/hooks/downloads.hook.ts
const { jobs, activeJobs, completedJobs, cancel, retry, resume, clearDone } = useDownloads()

// function parameters can destructure too:
function resolveApiTarget({ rawApiUrl, isDev, isNative, pageOrigin }: ApiTargetInput) { ... }
```

When you see `{ a, b } = something`, read it as "take `a` and `b` out of the object." Array destructuring `[first, second] = arr` appears rarely (the Python-like swaps in the queue store are the exception).

**Practice:** destructure `{ title, artist }` from a track variable in a scratch file and `console.log` both.

## 4. Spread and rest — `...`

Spread *unpacks* an array/object into another. Rest *collects* leftovers.

```ts
// real pattern, from web/src/pages/downloads/components/DownloadRow.tsx (drift guards)
const job = {
  ...jobProp,                                   // copy every field of the original…
  title: jobProp.title ?? 'Untitled',           // …then override the risky ones
  status: jobProp.status ?? 'queued',
}
```

This "copy-then-override" is how the codebase handles data from old caches or older servers. When reviewing, a spread first line followed by explicit fields means "trust the source, but pin the fragile parts."

```ts
// rest: gather remaining args into an array
function cn(...inputs: ClassValue[]) { ... }    // web/src/lib/utils.ts — used in 100+ files
```

## 5. The array toolbox — `map`, `filter`, `find`, `reduce`

| Method | Returns | Repo use |
|---|---|---|
| `.map(fn)` | new array, same length, transformed | list rows: `tracks.map(t => <Row …/>)` |
| `.filter(fn)` | new array of the keepers | `localTracks.filter(t => t.isDownloaded)` |
| `.find(fn)` | first match or `undefined` | `queue.find(t => t.id === id)` |
| `.some(fn)` | true if any item matches | "is anything downloading?" |
| `.reduce(fn, init)` | one accumulated value | totals: counting likes |
| `.sort(fn)` | sorted array (in place!) | `recentDone.sort((a, b) => b.createdAt.localeCompare(a.createdAt))` |

A real chain, from the My Music page:

```ts
[...completedJobs]                        // copy (sort would mutate the store!)
  .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
  .slice(0, 6)                            // newest six only
```

**Recognize:** chains are read left → right: "copy, sort newest-first, take six." Long chains deserve a name — if you write one, pull it into a `useMemo` (see [04](../04-react/components-and-state.md)).

**Practice:** write a chain that takes `jobs` and returns the titles of errored jobs, newest first. Two minutes, scratch file.

## 6. Optional chaining `?.` and nullish coalescing `??`

The two operators this codebase cannot live without:

```ts
const artist = track.artist?.name ?? 'Unknown Artist'
//            └─ if track.artist exists, read .name
//                                       └─ otherwise use this fallback
```

- `a?.b` — "if `a` is null/undefined, the whole expression is undefined *instead of crashing*."
- `a ?? b` — "use `a` unless it's null/undefined, then `b`."

`||` looks similar but treats `0`, `''` and `false` as missing — a subtle bug source. Rule used here: **`??` for values where 0/false/empty are legitimate; `||` only when "empty means missing" is intended.**

Where this matters for real: the backend serves guests, so many endpoints legitimately return empty lists. UI code therefore reads `data ?? []` everywhere — search for `?? []` in `web/src/pages` and you'll find dozens.

## 7. Ternaries — the inline if

```ts
// real, from the My Music header
{localCount} tracks · {downloadedCount} on device
{hasJobs ? ` · ${activeJobs.length} downloading` : ''}

// conditional UI (JSX) — the other ternary home
{loadingLocal ? <Skeleton /> : <TrackList tracks={filteredTracks} />}
```

**Recognize:** `condition ? whenTrue : whenFalse`. Nested ternaries beyond two levels are flagged in review — extract to a variable or `if`.

## 8. Generics — types with a hole

```ts
// real, from web/src/api/client.api.ts
async function get<T>(path: string): Promise<T>

// callers pick what T is:
const tracks = await api.get<Track[]>('/tracks')          // tracks: Track[]
const info    = await api.get<VersionInfo>('/version')    // info: VersionInfo
```

`<T>` is a placeholder filled in per call. You mostly *consume* generics (the `api.get<...>` calls, `useQuery<T>`, `useRef<number>`) rather than write them. When you see `<Something>` right after a function name, read it as "this function returns whatever shape I name here."

## 9. Interfaces, unions, and narrowing

```ts
// real shape (web/src/types/download.types)
export type DownloadStatus =
  | 'queued' | 'searching' | 'downloading'
  | 'converting' | 'tagging' | 'done' | 'error' | 'cancelled'

export interface DownloadJob {
  id: string
  status: DownloadStatus
  progress: number
  error?: string          // ? = this field may be absent
}
```

A **union** (`A | B | C`) is "exactly one of these." TypeScript then *narrows*: inside `if (job.status === 'error')`, it knows `job.error` is worth reading; outside, it warns. This is why the `STATUS_CONFIG` table in `DownloadRow.tsx` can be typed `Record<DownloadStatus, …>` — forget a status and the build fails, which is exactly what you want.

**Narrowing in the wild:**

```ts
if (typeof x === 'string') { x.toUpperCase() }   // x is string here
if ('error' in job) { … }                        // job has error here
```

## 10. Promises, async/await, error handling

```ts
// real, web/src/hooks/downloads.hook.ts
const download = useCallback(async (track: Track, options: DownloadOptions = DOWNLOAD_DEFAULTS) => {
  try {
    const job = await downloadsApi.startDownload({ trackId: track.id, ...payload })
    updateJob(tempId, job)
    signalDownload(track.id, track.artist?.name)
  } catch (e) {
    updateJob(tempId, {
      status: 'error',
      error:  e instanceof Error ? e.message : 'Download failed',
    })
  }
}, [addJob, updateJob])
```

Rules of the road in this repo:

1. `async function` + `await` everywhere; `.then()` chains only in old code you'll eventually meet.
2. **Every promise is either awaited or explicitly handled.** Floating promises = unobserved failures.
3. `catch (e)` uses `e instanceof Error ? e.message : 'fallback'` — because `catch` gives you `unknown`, and TypeScript refuses to guess.
4. `Promise.all` for independent work in parallel; `for … await` when order matters:

```ts
// parallel: fetch all three independently at once
const [tracks, albums, artists] = await Promise.all([
  searchApi.search(q, 'tracks'),
  searchApi.search(q, 'albums'),
  searchApi.search(q, 'artists'),
])
```

## 11. Enums / const objects / classes

- Real `enum`s don't appear; **string unions** (above) do the same job with better inference.
- One real class exists: `ErrorBoundary` (`web/src/components/ui/ErrorBoundary.tsx`) — React historically required classes for error boundaries. Everything else is functions.
- `as const` freezes an object's literal types:

```ts
export const STORAGE_KEYS = { … } as const   // each key's type is its exact string
```

## 12. Modules — import/export in practice

```ts
import { cn } from '@/lib/utils'                 // named
import ErrorBoundary from '@/components/ui/ErrorBoundary'  // default
import type { Track } from '@/types/track.types' // type-only import, erased at build
```

`import type` is used when you only want the shape — it vanishes from the built bundle. The `@/` alias maps to `web/src/`.

## Exercises

1. In `web/src/lib/utils.ts`, read `cn()`. It chains two libraries (`clsx`, `tailwind-merge`). Without running it, what do you expect `cn('p-2', cond && 'p-4')` to produce when `cond` is false? When true? (Answer in one sentence each, then check the test in `web/src/__tests__/utils.test.ts`.)
2. Find three uses of `?? []` in `web/src/pages`. For each, explain in one line what breaks without it.
3. Write a typed function `newestFirst(jobs: DownloadJob[]): DownloadJob[]` that returns errored jobs newest-first. Model it on the Downloads page chain in §5. Then write one sentence: why copy with `[...completedJobs]` before sorting?
4. Union drill: add a new status `'paused'` to `DownloadStatus` in a scratch branch and run `npx tsc --noEmit` in `web/`. Read every error TypeScript hands you — that list is your TODO map for supporting the new status. (Revert afterwards.)
