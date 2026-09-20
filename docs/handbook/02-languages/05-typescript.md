# Chapter 5 — TypeScript in Practice

*Part II · Languages*

---

JavaScript runs; TypeScript *checks*. Types add no behavior and no speed at runtime — they add certainty at build time: this field exists, this argument is a string, this branch handles the null case. This chapter covers the type system as the codebase uses it: precisely on the boundaries (API responses, store state, props) and pragmatically elsewhere.

## 5.1 Annotations

Types attach with colons:

```ts
let progress: number = 0;
function formatDuration(seconds: number): string { … }
const tracks: Track[] = [];            // array of Track
const jobs: Record<string, DownloadJob> = {};   // string-keyed map
```

Most annotations are *inferred* — `const x = 3` knows `x: number` without being told. The codebase annotates where inference is not enough: function signatures (the contract), empty collections (inference has nothing to work from), and module boundaries. Inside a function body, letting inference work keeps code shorter with no loss of safety.

## 5.2 Interfaces and type aliases

Two spellings for object shapes:

```ts
// web/src/types/track.ts
export interface Artist {
  id: string;
  name: string;
  imageUrl?: string;      // optional: may be absent
  genres?: string[];
}

// union of literals — a value from a closed set
export type RepeatMode = "off" | "all" | "one";
```

Rules of thumb, matching the codebase: `interface` for object shapes that implementations *implement* and that benefit from declaration merging; `type` for unions, intersections, and everything composed. `RepeatMode` is the pattern to internalize — a string-literal union makes the invalid state unrepresentable (`"reapeat"` is a compile error, not a silent no-op), which is why every mode-like value in the app (`DownloadStatus`, theme names) is one.

## 5.3 Optional fields, `null`, and `undefined`

The frontend's most common real bug class is reading a field that is not there. TypeScript's answer is to make absence part of the type:

```ts
interface Track {
  streamUrl?: string;      // absent until resolved
  filePath?: string;       // absent for remote tracks
}
```

A `?` field is `T | undefined`, and every read must handle it. The toolkit is Chapter 4.7's pair plus checks:

```ts
const url = track.streamUrl ?? fallbackUrl;
const artist = track?.artist?.name ?? "Unknown artist";
if (track.filePath === undefined) { /* remote path */ }
```

The codebase's hard rule, learned from the Downloads crash: **data crossing any boundary is untrusted until validated or guarded.** API responses, localStorage rehydration, Socket.IO payloads, files on disk — each has produced at least one real incident where reality did not match the interface. Interfaces describe intent; runtime data needs runtime guards. Chapter 16 shows the tests that pin this.

## 5.4 Narrowing

Inside a conditional, TypeScript refines the type:

```ts
function play(track: Track | null) {
  if (track === null) return;        // from here, track: Track
  track.duration;                    // OK — narrow already
}
```

All of these narrow: `if (x)`, `x === null`, `x instanceof ApiError`, `in` checks, and discriminated unions — objects with a shared literal tag:

```ts
type DownloadEvent =
  | { kind: "progress"; id: string; pct: number }
  | { kind: "done"; id: string; filePath: string }
  | { kind: "error"; id: string; message: string };

function onEvent(e: DownloadEvent) {
  switch (e.kind) {          // each case sees only its own shape
    case "progress": usePct(e.pct); break;
    case "done":     usePath(e.filePath); break;
    case "error":    show(e.message); break;
  }
}
```

Discriminated unions are the codebase's favorite tool for "one of several states" — download jobs, connection states, panel visibility. They replace boolean fields that can contradict each other (`isDone: true, isError: true`) with a shape that cannot lie. *Recognize in review*: two or more booleans that must never both be true is a design smell; propose the union.

## 5.5 Generics

Generics parameterize types — functions and containers that work over any type while keeping it precise:

```ts
// the API client's whole trick in one line
async function request<T>(path: string): Promise<T> { … }

const track = await request<Track>(`/tracks/${id}`);   // track: Track
const list  = await request<Track[]>("/tracks");       // list: Track[]
```

`T` is a placeholder filled at the call site: one implementation, a different concrete type per use, full checking at each. Beyond `request`, generics appear as `Promise<T>`, `Record<K, V>`, `Map<K, V>`, and React's `useState<T>`. In review, a generic that is only ever used with one type should be de-generalized; a function returning `any` where a generic would do is a finding.

## 5.6 Typing the boundaries

Where the codebase insists on types, and why:

| Boundary | Mechanism |
|---|---|
| HTTP responses | `api/*.ts` wrappers returning `Promise<Track>` etc., plus a generated `types/api-generated.ts` refreshed from the backend's OpenAPI spec |
| Component props | `interface Props` per component; destructured in the signature |
| Store state | Zustand stores declare their full state interface; actions included |
| Socket events | narrow payload types at the handler, validated defensively at runtime |
| Persisted storage | localStorage reads go through a parse-and-validate helper, never trusted as-is |

The generated-types point deserves emphasis: the backend publishes an OpenAPI document, and `types/api-generated.ts` is machine-derived from it, so the frontend's idea of a track and the backend's cannot silently drift — a schema change fails the frontend build until it is absorbed. Chapter 17 covers the regeneration command; Chapter 9 covers the backend side.

## 5.7 `any`, `unknown`, and escape hatches

`any` switches checking off: assignable to and from everything, member access unchecked — the type of a bug. `unknown` is the honest version: "some value, type unknown" — it may be *returned* but must be narrowed before *use*, which is exactly the discipline arbitrary JSON deserves:

```ts
function parseStored(raw: string): unknown {
  try { return JSON.parse(raw); } catch { return null; }
}
const prefs = parseStored(saved);          // unknown
if (isPrefsShape(prefs)) use(prefs);       // narrowed — checked
```

The codebase's rule: `any` appears only where a third-party library leaves no alternative, each occurrence with a reason; anything parsing outside data starts as `unknown` and narrows. `as` casts are similarly confined — a cast asserts what the compiler cannot verify, so every one is a place a runtime bug could hide, and review reads them as such. `as const` is the sanctioned exception: it narrows literals (`STORAGE_KEYS`) and is safer than the alternative, not less safe.

## 5.8 The compiler in practice

`tsc --noEmit` type-checks without emitting; it runs in CI, alongside lint and tests, on every change. Two failure messages account for most early confusion: `Object is possibly 'undefined'` (absence not handled — Sections 5.3/5.4 exist for this) and `Type 'x' is not assignable to 'y'` (shapes differ — read both sides of the message; usually the fix is at the boundary, not the use site). Chapter 15 returns to both with worked examples.

## Exercises

1. Convert `status: string` on a download job to a string-literal union. List every place the compiler now forces a review of, and what each caught or did not.
2. `function first<T>(arr: T[]): T | undefined` — implement it, then explain why the return type *must* include `undefined` for the empty case.
3. Find one discriminated union in the codebase (search the store and types folders). Draw its states and transitions.
4. A teammate writes `const data = (await res.json()) as Track[];`. Write the review comment: what it risks, and the stronger alternative.
5. Explain why `savedProgress ?? 0` is correct where `savedProgress || 0` would be a bug, in terms a Chapter 3 reader could follow.
