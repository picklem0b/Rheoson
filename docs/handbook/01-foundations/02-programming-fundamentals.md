# Chapter 2 — Programming Fundamentals

*Part I · Foundations*

---

Every language in this repository — TypeScript and Python alike — expresses the same small set of ideas: values, names for them, sequences of instructions, and ways to organize those instructions. This chapter covers the set once, in language-neutral terms, using the codebase's own code as evidence. Language-specific detail follows in Chapters 4–6.

## 2.1 Values and types

A **value** is a piece of data: a number, some text, a list, a yes/no. Values have **types** — a number behaves differently from text, and the language enforces some of those differences.

The types that matter everywhere:

| Type | Meaning | Example from the codebase |
|---|---|---|
| number | a quantity | `track.duration` (seconds), `volume` (0.0–1.0) |
| string | text | `"dQw4w9WgXcQ"`, a track title |
| boolean | true or false | `track.isDownloaded`, `isPlaying` |
| array / list | ordered collection | the play queue, the list of liked track IDs |
| object / dict | named fields | a track: `{ id, title, artist, album, duration, … }` |
| null / None / undefined | absence of a value | `currentTrack` when nothing is loaded |

Two facts about strings recur constantly. First, everything that crosses a network or a file boundary is text — including data that is conceptually structured. Second, text encoding matters: a downloaded filename with a non-Latin character can break a path comparison if the two sides disagree about encoding. Python 3 and modern JavaScript both use UTF-8 by default, which is why this rarely bites here, but Chapter 15 lists it among the classic failure points anyway.

Numbers deserve one caution. A track duration of `213` seconds is exact; a volume of `0.1` is not — binary computers cannot represent most decimal fractions exactly, so `0.1 + 0.2` is `0.30000000000000004`. Harmless for volume, dangerous for money, and worth knowing whenever two floating-point values are compared for equality.

## 2.2 Variables and constants

A **variable** is a name bound to a value. Binding is not gluing: the name can later be re-bound to a different value. A **constant** is a name intended never to be re-bound.

```ts
// web/src/lib/constants.ts
export const APP_VERSION = "2.17.11";
export const STORAGE_KEYS = { volume: "rheoson-volume" } as const;
```

The convention in this codebase, as in most TypeScript code: `const` by default, `let` when re-binding is genuinely needed, `var` never (its scoping rules are surprising). Python writes all names the same way and uses `UPPER_SNAKE_CASE` as a social signal for constants: `MUSIC_DIR`, `VERSION`, `_ALLOWED_ORIGINS`.

A subtle and important distinction: `const` freezes the *binding*, not the *value*.

```ts
const job = { id: "j1", progress: 10 };
job.progress = 90;          // fine — the object's contents may change
job = { id: "j2" };         // TypeError — the binding may not
```

`STORAGE_KEYS` above is marked `as const` precisely to freeze the object's *contents* too, making any later change a compile-time error.

## 2.3 Functions

A **function** packages instructions under a name. It takes **parameters**, does work, and hands back a **return value**. Functions are the primary unit of organization in this codebase — there are almost no classes on the frontend, and backend logic concentrates in service modules of plain functions.

```ts
// web/src/lib/formatters.ts
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}
```

Three things are visible even in ten lines:

**Signature.** The function takes one parameter and returns a string — declared explicitly, which TypeScript then enforces at every call site.

**Guard clause.** The first line handles impossible input (`NaN`, negative) and exits early. Early exit keeps the main path flat; this shape appears throughout the codebase.

**Composition.** `formatDuration` is used by every track row and the player bar. It is one of the most-called functions in the frontend — small, pure, and therefore trivially testable (`web/src/__tests__/formatters.test.ts`).

**Pure and impure functions.** A *pure* function's output depends only on its inputs, and it changes nothing outside itself. `formatDuration` is pure: same seconds in, same string out, nothing else touched. An *impure* function touches the world — writes a file, mutates a store, makes a network call. The codebase concentrates impure actions at the edges (API modules, stores, services) and keeps the middle pure where it can, because pure code is easy to test and reason about. This division is the single most useful structural idea to carry into code review.

## 2.4 Objects, arrays, and their vocabulary

An **object** (Python: dict) groups related fields under names. An **array** (Python: list) is an ordered sequence. Nearly every shape in the app is one or a combination:

```ts
// the shared Track shape — web/src/types/track.ts, api/app/schemas/track_schema.py
interface Track {
  id: string;              // YouTube videoId OR a local file hash
  title: string;
  artist: { id: string; name: string; imageUrl?: string };
  album: { id: string; title: string; artworkUrl: string; … };
  duration: number;
  isDownloaded: boolean;
  isLiked: boolean;
}
```

The `?` marks an **optional** field: `imageUrl` may be absent, and TypeScript forces every read to handle that. Chapter 5 expands optional fields into the larger topic of *nullability* — the single most common source of real-world bugs.

Arrays support a standard vocabulary of operations that reading code fluently requires (Chapter 4 shows the JavaScript forms; Chapter 6 the Python):

- **map** — transform every element, same length out
- **filter** — keep elements passing a test, same or fewer
- **find** — first element passing a test, or nothing
- **reduce** — fold the array into a single value (a sum, an object)
- **sort** — reorder, often in place; always ask whether it mutates

**Mutability** splits this vocabulary. A queue is mutated in place as tracks play (`queueStore.next()` shifts the front element off); a rendered list is derived, never mutated — React re-renders when state changes, and mutating render inputs causes the classic stale-UI bugs. Chapter 7 returns to this.

## 2.5 Conditions

Code chooses. The **if/else** family exists in every language here:

```ts
if (track.isDownloaded) {
  playFromDisk(track);
} else if (navigator.onLine) {
  playFromNetwork(track);
} else {
  showOfflineBanner();
}
```

Longer chains over one value use `switch` (TypeScript/JavaScript) or `match` (Python 3.10+). The streaming router is a switch in spirit — local file if cached, yt-dlp pipe otherwise — and the download service's player-client ladder is an explicit loop of attempts, each conditioned on the previous failure. Conditions combine with `&&` (and), `||` (or), `!` (not), and the **ternary** `condition ? a : b` for short inline choices — used liberally in the frontend's class-name logic.

## 2.6 Loops

**Loops** repeat. Two shapes cover nearly everything:

```python
# counted / iterable — the common case
for track in tracks:
    total += track.duration

# while — repeat until a condition flips
attempt = 0
while attempt < len(CLIENT_LADDER) and not succeeded:
    try_client(CLIENT_LADDER[attempt]); attempt += 1
```

Anything expressible as "do this to every element" is usually clearer as `map`/`filter`/comprehensions than as a manual loop, and the codebase prefers them. A caution that appears in real review findings: loops that *collect* into a list while also *mutating* that same list are almost always wrong; and loops over a collection while removing from it skip elements unless written carefully. Chapter 19 catalogs both.

## 2.7 Modules, imports, and exports

Code is organized into **modules** — files that declare what they provide (**exports**) and what they use from others (**imports**). The import graph is the codebase's skeleton:

```ts
// web/src/pages/downloads/Downloads.tsx
import { usePlayerStore } from "@/store/playerStore";
import { tracksApi } from "@/api/tracks";
import { formatDuration } from "@/lib/formatters";
```

`@/` is an alias for `web/src`, configured in Vite and `tsconfig`, so imports never depend on how deep the file sits. Python has the same concept with different spelling (`from app.services.download_service import enqueue_download`) and one structural difference worth knowing: Python packages are directories with `__init__.py` (or namespace packages), and the backend's import graph is strictly layered — routers import services, services import core, never the reverse. Chapter 9 draws the layering.

Cycles — A imports B imports A — are possible in both languages and are almost always a design smell. The codebase avoids them by routing shared types through dedicated modules (`types/`, `schemas/`).

## 2.8 Asynchrony

Some operations take time: a network round trip, a disk read, a three-minute download. Waiting *blockingly* — doing nothing until the operation finishes — would freeze the interface and starve the server. **Asynchronous** code starts an operation and arranges to continue when it completes, letting everything else run meanwhile.

Both languages here express this with the same syntax and a matching mental model:

```ts
// TypeScript — web/src/api/tracks.ts (abridged)
export async function getTrack(id: string): Promise<Track> {
  const res = await http.get(`/tracks/${id}`);
  return res.data;
}
```

```python
# Python — api/app/routers/track_router.py (abridged)
@router.get("/{track_id}")
async def get_track(track_id: str) -> TrackSchema:
    return await track_service.get(track_id)
```

`async` marks a function as one that may pause; `await` marks the pause point — "start this, yield control, resume here when the result arrives." Under TypeScript's syntax sits the **Promise**: an object representing a value that will exist later, with states pending → fulfilled or rejected. Chapter 4 covers Promises precisely; the model to hold now is that `await` consumes a Promise and `async` produces one.

Two rules prevent most async bugs and are treated as law in this codebase: never call an async function and ignore the returned value, and never `await` inside a loop when the iterations are independent — start them together and await together (`Promise.all`, `asyncio.gather`), which is what the search fanout and playlist hydration both do.

## 2.9 Errors and exceptions

Chapter 1 named the three failure classes; here is the mechanism for the second. When something goes wrong, the code *throws* (raises) an **exception** — an object describing the failure — and execution unwinds until a handler catches it or the process dies.

```python
# api/app/services/ytmusic_service.py (abridged)
if _ytm_error:
    raise SearchError("YouTube Music is unavailable — retrying shortly")
```

```python
# api/app/core/exceptions.py — one handler, many known types
@app.exception_handler(RheosonException)
async def rheoson_handler(request, exc):
    return JSONResponse(status_code=exc.status_code,
                        content={"detail": exc.message})
```

The pattern is deliberate: low-level code raises *named* errors; a single high-level handler converts them into HTTP responses. Frontend code does the mirror image — the API client wraps every call and turns transport failures into an `ApiError` carrying status and message, so UI code catches one type instead of guessing at network quirks. Chapter 9 traces both sides.

The discipline that keeps this sane: catch narrowly, translate, never swallow. An empty `except:` or `catch (e) {}` that silently eats an error converts a diagnosable failure into a mystery, and is treated in review as a defect, not a style choice.

## 2.10 The shape of the whole

With the vocabulary in place, a full feature read end-to-end — "add a track to a playlist" — is now just sentences in this language:

1. A component calls `playlistsApi.addTrack(playlistId, trackId)` (async function, Chapter 2.8).
2. The API module builds an HTTP request (Chapter 3) with `POST /api/playlists/{id}/tracks`.
3. The backend route (Chapter 9) validates the body with a schema (Chapter 6), asks the playlist service to update the JSON store on disk (Chapter 10), and returns the updated playlist.
4. The frontend updates the playlists store (Chapter 7), and React re-renders the list.

Nothing in that paragraph is new after this chapter — which is the point. The remaining parts of the handbook attach specifics: the exact tools (Chapters 4–6, 11), the exact files (Chapters 8–10, 12), and the exact practices (Chapters 13–18).

## Exercises

1. Classify each as pure or impure: `formatDuration`; `saveProgress()` in the player store; `cn()` in `web/src/lib/utils.ts`; the download service's tagging step.
2. Predict and verify: what does `formatDuration(3671)` return? Check against `web/src/__tests__/formatters.test.ts`.
3. In `queueStore.ts`, find where `next()` removes an element from `queue`. Which array method is it, and does it mutate?
4. Write a one-sentence explanation of `await` suitable for Chapter 1's reader, then a one-sentence correction of the common misconception "`await` makes the program wait."
5. Find one guard clause and one ternary in `web/src/lib/utils.ts` or `formatters.ts`. State each in plain English.
