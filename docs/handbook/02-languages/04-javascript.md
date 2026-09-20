# Chapter 4 — JavaScript Fundamentals

*Part II · Languages*

---

The frontend speaks TypeScript, but TypeScript *is* JavaScript plus types — every type annotation disappears before the browser sees the code. Reading the JavaScript underneath fluently is therefore the first frontend skill. This chapter covers the language patterns the codebase actually uses. For each core pattern: a minimal example, a real one from the repository, how to recognize it in review, and a practice task.

## 4.1 Syntax and variables

Statements end implicitly; blocks use braces; comments are `//` and `/* … */`. Names bind with `const` (never re-bound), `let` (re-bindable), and `var` (obsolete — its function-scoping surprises are why it is banned in review).

```js
const rate = 0.8;      // binding fixed
let retries = 0;       // binding can change
retries += 1;
```

*In the codebase* — `web/src/lib/constants.ts` is almost entirely `const` declarations; the store files use `let` only for genuinely mutable module-level state such as the Howler instance.

*Recognize in review*: any `var` is a finding; any `let` that is never re-assigned should have been `const`.

*Practice*: open `web/src/lib/utils.ts` and classify every binding as `const`-correct or not.

## 4.2 Types at runtime

JavaScript's runtime types are the Chapter 2 set: number (one type for all — integers and floats alike), string, boolean, undefined ("never set"), null ("deliberately empty"), object, and the array/object duality. Two runtime truths TypeScript cannot fully hide and code review must watch for:

- `typeof null` is `"object"` — a historical bug in the language itself.
- `0`, `""`, `null`, `undefined`, `NaN` are all **falsy**; everything else is **truthy**. `if (queue.length)` and `if (queue)` mean different things, and confusing them is a classic bug.

## 4.3 Functions and arrows

Functions are values — assignable, passable, returnable. Two spellings:

```js
function formatDuration(seconds) { … }        // declaration
const formatDuration = (seconds) => { … };    // arrow (the codebase default)
```

Arrows differ in one behaviorally important way: they do not create their own `this`. In React code this makes arrows the safe default for callbacks, because a component method's `this` expectations are otherwise easy to break. The codebase's hook files use arrows almost exclusively.

*Recognize in review*: a mix of both spellings is fine; `function` inside a React component is fine; what matters is whether a callback captures the right context — the bug arrows exist to prevent.

## 4.4 Objects, arrays, and the standard toolkit

Object literal, property access, and the two access styles:

```js
const track = { id: "dQw4w9WgXcQ", title: "Never Gonna Give You Up" };
track.id;              // dot — when the key is a known identifier
track["file_" + n];    // bracket — when the key is computed
```

Arrays carry the vocabulary introduced in Chapter 2.4. The codebase uses it constantly; these four lines from real files are the dialect to absorb:

```ts
// web/src/store/queueStore.ts — filter keeps, find locates
const next = upcoming.find((t) => t.id === id);
const playable = tracks.filter((t) => !t.isLocalOnly);

// web/src/pages/library — map transforms for render
const rows = albums.map((a) => ({ id: a.id, label: a.title, artwork: a.artworkUrl }));

// history aggregation — reduce folds to a value
const plays = events.reduce((acc, e) => { acc[e.id] = (acc[e.id] ?? 0) + 1; return acc; }, {});
```

Mutation caution: `sort` and `reverse` reorder *in place*. Deriving a shuffled queue must not disturb `originalQueue`, which is exactly why `queueStore` copies arrays before sorting. In review, any `sort` on a prop, a store array, or a function parameter is a finding unless a copy was taken first (`[...arr].sort()` or `toSorted()`).

*Practice*: in `queueStore.ts`, find one `filter`, one `find`, and one copy-before-mutate. Write a one-line comment above each explaining why mutation would be wrong there.

## 4.5 Destructuring

Destructuring unpacks objects and arrays into names in one step:

```ts
const { currentTrack, isPlaying } = usePlayerStore();   // object
const [first, ...rest] = queue;                          // array + rest
function TrackRow({ track, index, onPlay }: Props) {}    // in parameters
```

*In the codebase* — every React component destructures its props; the Zustand stores expose state as objects consumed by destructuring at call sites.

*Recognize in review*: destructuring in parameters documents the contract at the signature — prefer it to indexing `props.x` throughout a body. Watch for destructuring a possibly-null value; Chapter 5's optional chaining pairs with it.

*Practice*: take a component that reads `props.track.title` twice and rewrite it with destructuring; note what gets shorter.

## 4.6 Spread and rest

Three dots with two meanings:

```ts
{...defaults, ...overrides}     // spread in an object literal: copy then overwrite
const original = [...queue];    // spread in an array literal: shallow copy
function tag(...parts: string[]) {}   // rest in a parameter: collect
```

The codebase's `cn()` utility is built entirely on rest-and-spread: it *collects* any number of class inputs (rest) and *merges* them (the underlying library spreads). Shallow-copy caveats apply — spreading copies the top level only; nested objects are still shared, which has produced real aliasing bugs elsewhere and is worth checking whenever a copied object is later mutated deeply.

## 4.7 Optional chaining and nullish coalescing

The two operators that make absence safe:

```ts
const name = track?.artist?.name;        // undefined instead of a TypeError chain
const count = likedCount ?? 0;           // fallback for null/undefined only
```

`?.` short-circuits: if `track` is nullish the whole expression is `undefined` and nothing further runs. `??` falls back only on `null`/`undefined` — unlike `||`, a legitimate `0` or `""` passes through, which is why volume code uses `??` (`savedProgress ?? 0` must not turn a 0-second position into "unstarted" logic errors).

*In the codebase* — the Downloads page rows guard optional schema drift with exactly this pair (`track?.artist?.name ?? "Unknown artist"`), added after a real crash on a track object missing its artist.

*Recognize in review*: `||` used for fallbacks on numeric or string fields is a finding — ask whether `0`/`""` are legitimate values. Optional chaining that swallows an error condition silently is a finding too; guarding shape is fine, hiding *unexpected* nulls is not.

*Practice*: find three `??` uses in the codebase and write down what would change if each were `||`.

## 4.8 Ternaries and control flow in expressions

The ternary `cond ? a : b` is an expression, not a statement — it produces a value, so it lives inside JSX and class computations:

```tsx
<span className={cn("rounded-full px-2", isPlaying ? "bg-white text-black" : "bg-white/10")}>
```

Rule of thumb the codebase follows: ternaries for *values*, `if/else` for *actions*. A ternary whose branches perform side effects is harder to read than the statement form and is flagged in review.

## 4.9 Promises and async/await

A **Promise** is a value that arrives later. It is *pending*, then either *fulfilled* (a value) or *rejected* (a reason). `await` consumes one; `async` functions produce one; rejections propagate until a `try/catch` handles them.

```ts
// web/src/api/client.ts (abridged) — the shape every API call takes
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json();
}
```

Realistic composition — independent work starts together:

```ts
// search fanout (abridged): all four queries at once, not one after another
const [songs, albums, artists, playlists] = await Promise.all([
  searchSongs(q), searchAlbums(q), searchArtists(q), searchPlaylists(q),
]);
```

`Promise.all` rejects as soon as any input rejects — all-or-nothing. Its sibling `Promise.allSettled` waits for every outcome and reports successes and failures separately, which is the right tool when partial results are acceptable (playlist hydration uses that shape: one missing track should not erase the rest).

*Recognize in review*: an `async` function called without `await` (the floating promise — its errors vanish); `await` inside a `for` loop over independent items (a performance bug, not a style nit — it serializes N round trips); an empty `catch`.

*Practice*: `queue.hook.ts` and `search.hook.ts` between them contain all three patterns above. Find one instance of each and label it.

## 4.10 Error handling

`try/catch/finally`, and the discipline stated in Chapter 2.9 — catch narrowly, translate, never swallow:

```ts
try {
  const track = await getTrack(id);
  setTrack(track);
} catch (err) {
  if (err instanceof ApiError && err.status === 404) showNotFound();
  else throw err;                       // unknown → re-raise, do not eat it
} finally {
  setLoading(false);                    // runs either way
}
```

The `instanceof` narrowing is doing real work: the catch block cannot know what it caught until it asks, which is Chapter 5's subject. The frontend's convention is that API modules throw `ApiError` and only UI layers catch — so every catch in the codebase is either translating to UI state or deliberately re-throwing.

## 4.11 Modules

One module per file; `export` publishes, `import` consumes; the `@/` alias anchors paths at `web/src`. Default exports (one per module) and named exports (many) both appear, with a codebase convention: components are default-exported, utilities and API modules are named. Re-exports (`export * from "./types"`) appear in the `types/` barrel files — convenient, but every barrel is a potential import cycle, so barrels exist only for type-only collections here.

## 4.12 Classes — the small print

The codebase deliberately uses almost no classes; functions, closures, and modules cover its needs. The exceptions are instructive rather than stylistic: `ApiError extends Error` (needs `instanceof` to work) and the Socket.IO client wrappers (the library is class-shaped). A new contributor should read a class here as "the library made me" unless proven otherwise.

## Exercises

1. Rewrite with destructuring + defaults: `function f(opts) { const a = opts.a; const b = opts.b || 10; }` — and say what your version fixes.
2. Explain the difference in outcome: `await Promise.all([a(), b()])` versus `const x = a(); const y = await b(); await x;`
3. Find the spread that protects `originalQueue` in `queueStore.ts`. What breaks if it is deleted? (Answer with a scenario, not just "shuffling is wrong.")
4. The client in 4.9 throws `ApiError` on any non-OK status. Trace what UI code catches a 404 from track fetch and what it renders.
5. Write a `reduce` that turns `[{id, playedAt}]` history entries into `{id: count}`. Compare with the real aggregation in the analytics code path.
