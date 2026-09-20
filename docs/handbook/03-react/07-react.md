# Chapter 7 — React Fundamentals

*Part III · The Codebase*

---

React is a library for building interfaces out of **components** — functions that take data and describe what the screen should look like for that data. Its central promise: when the data changes, the description runs again and the screen follows. This chapter covers React from first principles through the patterns this codebase uses, explaining *why* the code is shaped as it is, not just what each line does.

## 7.1 Components and JSX

A component is a function from props to a description of UI. The description language is **JSX** — HTML-like syntax inside TypeScript that compiles to function calls:

```tsx
// web/src/components/ui/QualityBadge.tsx (abridged)
export function QualityBadge({ format }: { format: AudioFormat }) {
  return (
    <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs uppercase">
      {format}
    </span>
  );
}
```

The rules that make JSX readable: braces embed *expressions* (values, ternaries, `.map()` calls), components return one root element (or `<>…</>` to group without adding a DOM node), attributes are camelCase (`className`, `onClick`), and names starting with capitals are components while lowercase names are HTML elements. The codebase convention: components default-exported, one per file, files named for the component.

## 7.2 Props

**Props** are the inputs — how a parent configures a child. They flow in one direction, and a child never mutates what it receives:

```tsx
type TrackRowProps = {
  track: Track;
  index: number;
  onPlay: (id: string) => void;
};

export function TrackRow({ track, index, onPlay }: TrackRowProps) { … }
```

Parent side, the same contract in use:

```tsx
{queue.map((t, i) => (
  <TrackRow key={t.id} track={t} index={i} onPlay={play} />
))}
```

Callbacks are props too (`onPlay`) — the mechanism by which a child reports events upward. The codebase keeps them strictly one level deep: a row receives `onPlay`, it does not receive the player store itself. This keeps components renderable in isolation and testable without the world.

## 7.3 State: `useState`

**State** is data a component owns that may change over time. Changing it schedules a re-render:

```tsx
const [query, setQuery] = useState("");
const [results, setResults] = useState<Track[]>([]);

// never mutate; always replace
setResults([newTrack, ...results]);      // ✔ new array
results.push(newTrack);                  // ✘ React never sees this
```

The no-mutation rule is React's most commonly broken one: React compares *references*, and pushing into the same array keeps the reference identical, so nothing re-renders. The codebase's stores all follow replace-don't-mutate for the same reason (Chapter 8.3).

## 7.4 Effects: `useEffect`

An **effect** synchronizes the component with the outside world — network, timers, subscriptions, the audio engine. Its signature is `useEffect(fn, dependencies)`: run `fn` after render, and re-run whenever anything in `dependencies` changes since last time.

```tsx
// web/src/hooks/lyrics.hook.ts (abridged)
useEffect(() => {
  if (!trackId) return;
  let cancelled = false;                      // ① guard for stale results
  setLoading(true);
  lyricsApi.get(trackId)
    .then((lrc) => { if (!cancelled) setLyrics(lrc); })
    .catch(() => { if (!cancelled) setError(true); });
  return () => { cancelled = true; };         // ② cleanup on change/unmount
}, [trackId]);                                // ③ the trigger
```

Every part carries weight: the **dependency array** is the contract ("re-run when `trackId` changes" — and omitting a used value is a bug that stale data hides); the **cleanup function** is where subscriptions, timers, and abort controllers are released; and the **cancelled flag** prevents the classic race where a slow response for an old track overwrites the result for the new one. The codebase's data-fetching hooks all share this skeleton, and TanStack Query (Chapter 11) automates most of it where the pattern is pure fetch-and-cache.

The dependency-array rules as enforced in review: every reactive value used inside must be listed; arrays list values, not objects recreated each render; and "I know it fires too often" is solved by restructuring (derive, or split the effect), never by omitting a dependency or disabling the lint rule without a written reason.

## 7.5 `useMemo` and `useCallback`

Two hooks for *caching*, both tools against recomputation on every render:

```tsx
const visible = useMemo(() => heavyFilter(tracks, query), [tracks, query]);
const handlePlay = useCallback((id: string) => play(id), [play]);
```

`useMemo` caches a computed value until a dependency changes; `useCallback` caches a function identity. The second matters when identity is part of a contract: an effect that depends on a callback re-runs every render unless the callback is stable. The codebase uses both sparingly and deliberately — memoizing genuinely heavy derivations (charts, filtered lists over large libraries) and stabilizing callbacks that effects or memoized children consume. Reflexive wrapping of everything is itself flagged in review: caching has costs, and correctness comes from dependencies, not from `useMemo`.

## 7.6 `useRef` and mutable values

`useRef` holds a mutable box that survives re-renders *without* triggering one — the right home for anything that is identity, not display:

```tsx
const abortRef = useRef<AbortController | null>(null);

function search(q: string) {
  abortRef.current?.abort();                        // cancel the previous
  abortRef.current = new AbortController();
  fetchResults(q, abortRef.current.signal);
}
```

The distinction worth internalizing: state for data the *render* shows; refs for data the *logic* uses (the in-flight request, a timer ID, the Howler instance pointer). Putting render data in a ref silently freezes the UI; putting plumbing in state causes pointless re-render storms.

## 7.7 Custom hooks

A **custom hook** is any function named `use…` that calls other hooks — the unit of reusable *behavior*, as components are the unit of reusable UI. The codebase is hook-heavy by design; the player, queue, downloads, search, and lyrics are each a hook over a store:

```ts
// web/src/hooks/player.hook.ts — the thin-wrapper pattern
export function usePlayer() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const play = usePlayerStore((s) => s.play);
  return { currentTrack, play };
}
```

Two conventions carry real weight. First, hooks compose over stores rather than duplicating logic: the store owns state and actions, the hook adapts them for components (Chapter 8.3 draws the line). Second, the module-singleton pattern in `player.hook.ts`: the audio engine (`_howl`, `_loadedId`) lives at module scope *outside* React entirely, with hooks as its facade — deliberate, because audio must survive re-renders, strict-mode double-mounts, and route changes uninterrupted.

The one law of hooks, enforced by the linter: call them unconditionally, at the top level of a component or another hook — never inside conditions, loops, or event handlers. React's whole model depends on hooks being called in the same order every render.

## 7.8 Conditional rendering and lists

Presence with `&&`, choice with ternaries:

```tsx
{isLoading && <Spinner />}
{error ? <OfflineBanner /> : <TrackList tracks={results} />}
```

Lists render from arrays with a **key** — a stable identity so React can match old and new elements across renders:

```tsx
{tracks.map((t) => <TrackRow key={t.id} track={t} />)}
```

Keys must be stable IDs. Array indices as keys are acceptable only for static lists; for a mutable queue they cause the notorious wrong-row bug (reordering makes React reuse rows for the wrong tracks — state like "is playing" visually sticks to the wrong item). The codebase keys everything by track or job ID.

## 7.9 Forms and events

Inputs are controlled — the value lives in state, the change handler updates it:

```tsx
const [title, setTitle] = useState("");
<input value={title} onChange={(e) => setTitle(e.target.value)} />
```

Events take the same handler shape as props: `onClick={() => save(title)}`, with the handler doing the async work and catching its own errors (an unhandled rejection in an event handler is as real a bug as one in an effect). The codebase has no form library; forms are few and fully controlled.

## 7.10 Composition

Components compose by wrapping: a generic shell takes children, a page assembles sections from smaller parts.

```tsx
// children — the composition primitive
function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white/5 p-4">
      <h3 className="mb-2 text-sm text-white/50">{title}</h3>
      {children}
    </section>
  );
}
```

The layout shell (`RootLayout`) wraps every routed page and renders the player bar and navigation around it; page components compose groups, rows, and grids. The review heuristic that falls out: if two components share markup, the markup becomes a component; if two components share *behavior*, the behavior becomes a hook; if two pages share both, both are extracted.

## 7.11 Routing

Routing maps URLs to components. The app uses React Router with a route table in `web/src/router.tsx`: pages nested under `RootLayout`, the fullscreen player route outside it, redirects for legacy paths. Route parameters (`/playlist/:id`) arrive via the `useParams()` hook; navigation is programmatic (`useNavigate()`) or declarative (`<Link>`). One structural fact with visible consequences: the NowPlaying route renders *without* the layout shell, which is why it can go fullscreen — routes own their chrome.

## 7.12 Loading, error, and empty states

Every screen that shows fetched data owes the reader three additional states, and the codebase's convention is that all three are first-class:

- **Loading** — skeletons or spinners; never a blank region.
- **Error** — a message with a recovery action (retry), not a dead screen; the global error boundary (Chapter 8.5) is the last resort, not the first.
- **Empty** — "no downloads yet" with a call to action, distinct from loading and from error.

A page that renders only its happy path is incomplete in review — the Downloads and Library pages are the reference implementations of all four states.

## 7.13 State management: the store layer

Component state covers local concerns; everything shared or durable lives in **Zustand** stores (`web/src/store/`). A store is a function that creates a state container with actions; components subscribe with selectors:

```ts
const volume = usePlayerStore((s) => s.volume);          // subscribe to one field
const setVolume = usePlayerStore((s) => s.setVolume);
```

Selectors are performance: subscribing to the whole store re-renders on every change anywhere in it; selecting one field re-renders only when that field changes. The store layer's full architecture — which stores exist, what persists, the hook-over-store rule — is Chapter 8.3's subject. The React-side rule is simply: components never reach into another feature's store, and any two components sharing state is a signal the state belongs in a store, not in a shared parent.

## 7.14 Reading a component, end to end

The skill the chapter builds, applied to a real page skeleton:

```tsx
export default function Downloads() {
  const activeJobs = useDownloadStore(selectActiveJobs);     // ① store state, selected
  const [tab, setTab] = useState<TabId>("activity");          // ② local UI state
  useEffect(() => { syncWithServer(); }, []);                 // ③ one-time world sync
  const rows = useMemo(() => groupByTab(activeJobs, tab), [activeJobs, tab]);  // ④ derivation
  if (rows.loading) return <SkeletonList />;                  // ⑤ states first
  if (rows.error) return <ErrorState onRetry={syncWithServer} />;
  if (rows.empty) return <EmptyState cta="Find music" />;
  return <TabBar …>{rows.visible.map((j) => <DownloadRow key={j.id} … />)}</TabBar>;  // ⑥ happy path last
}
```

State from the right layer (①②), effects doing exactly one job (③), derivation cached (④), every non-happy state handled (⑤), and the map with stable keys (⑥). That skeleton, with variations, is nearly every page in `web/src/pages/` — and Chapter 17 builds new pages by filling it in.

## Exercises

1. A teammate's `useEffect` fetches inside a loop with `await`. Rewrite it to cancel-and-fetch-once, using 7.4's skeleton, and list the two bugs the loop version has.
2. Explain to a Chapter 3 reader why `results.push(x)` fails to update the screen, in one sentence about references.
3. Find the `key=` on the queue list. What breaks visually if it becomes the array index? Name the mechanism from 7.8.
4. Take `QualityBadge` and add an optional `variant?: "compact" | "full"` prop with a default. What does the compiler force you to check at each usage site?
5. In `player.hook.ts`, identify one value that is a ref and one that is state, and justify each against the 7.6 distinction.
