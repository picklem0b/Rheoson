# React Fundamentals — As This Project Uses Them

*Stage 4. React is the library that draws the screens. The mental model in one sentence: **UI is a function of state** — the same state always draws the same screen, and React redraws when state changes. Everything below is that sentence in practice.*

## 1. Components — functions that return UI

```tsx
// web/src/pages/downloads/components/DownloadRow.tsx (heavily abridged)
export default function DownloadRow({ job, index, onCancel }: DownloadRowProps) {
  return (
    <div className="rounded-3xl border …">
      <p>{job.title}</p>
      <button onClick={onCancel}>✕</button>
    </div>
  )
}
```

A component is a function whose name starts with a capital letter and which returns **JSX** — HTML-looking syntax (`<div>`, `<p>`) that compiles to function calls. One component = one visual piece, reused as a tag: `<DownloadRow job={…} onCancel={…} />`.

## 2. Props — the inputs

Props are the object a parent passes in, destructured in the signature. `DownloadRowProps` above declares `{ job, index, onCancel }`. Props flow **down** (parent → child) and events flow **up** (child calls `onCancel`, parent decides what that means). This one-way flow is why you can trace any tap through the code: the handler always lives above the JSX that triggers it.

## 3. State — the memory

```tsx
const [query, setQuery] = useState('')
```

`useState` returns the current value and its setter. Changing state asks React to redraw:

```tsx
<input value={query} onChange={e => setQuery(e.target.value)} />
{query && <button onClick={() => setQuery('')}>✕</button>}
```

Two iron rules: **never mutate state directly** (`jobs.push(x)` on a state array does nothing visible — set a *new* array), and **state setters are async-ish** — don't read the variable right after setting it.

## 4. The hook gallery — what each is *for*

| Hook | One-line job | Repo example |
|---|---|---|
| `useState` | component memory | `const [query, setQuery] = useState('')` (Downloads.tsx) |
| `useEffect` | sync with the outside world after render | WebSocket subscriptions, version checks |
| `useMemo` | cache an expensive computation | `filteredTracks` (Downloads.tsx) |
| `useCallback` | stable function identity | `download`, `retry` in downloads.hook.ts |
| `useRef` | a box that survives renders without causing them | the long-press timer in `useTrackContextMenu` |
| custom hooks | reuse *stateful logic* (not UI) | `usePlayer`, `useDownloads`, `useQueue` |

### `useEffect` — the door to the outside

```tsx
useEffect(() => {
  ws.on('download:progress', onProgress)     // subscribe
  return () => ws.off('download:progress', onProgress)   // unsubscribe on unmount
}, [updateJob])                              // re-run if updateJob changes
```

The **dependency array** is the contract: "re-run me if any of these change." An empty array `[]` = once on mount. A missing array = every render (usually a bug). Forgetting the cleanup function leaks subscriptions — the `return` above is not decoration.

### `useMemo` / `useCallback` — the perf pair

```tsx
// recompute the filtered list only when the list or the query changes
const filteredTracks = useMemo(() => localTracks?.filter(…), [localTracks, query])

// keep the same function identity between renders so children don't re-render
const download = useCallback(async (track: Track) => { … }, [addJob, updateJob])
```

Rule of thumb: `useMemo` for *values* that cost real work; `useCallback` for functions handed to memoized children or used as effect dependencies. Don't sprinkle them everywhere — they cost memory too.

### `useRef` — the silent box

```ts
const timer = useRef<number | null>(null)   // survives re-renders…
timer.current = 42                          // …changing it never redraws…
timer.current                              // …and reading it gives the latest value
```

Used here for long-press timers, previous-status maps, and the Howler singleton pointer — anything that must persist *without* being displayed.

## 5. Custom hooks — the codebase's favorite abstraction

If a component starts needing state + effects + store access, that logic moves into a hook so any component can use it:

```ts
// web/src/hooks/downloads.hook.ts (exported API)
const { jobs, activeJobs, completedJobs, download, cancel, retry, resume, clearDone } = useDownloads()
```

Pattern to recognize: a file in `web/src/hooks/` exporting one `useXxx` function that itself calls `useState`/`useEffect`/stores. The component stays dumb; the hook holds the behavior. When reviewing a page, expect it to be mostly composition — the real logic lives in the hooks it calls.

## 6. Conditional rendering and lists

```tsx
{hasJobs && <DownloadSection />}                    {/* render only if */}
{loadingLocal ? <Skeleton /> : <TrackList />}       {/* either/or */}

// lists: always a key
{filteredTracks.map((track, i) => (
  <LibraryTrackRow key={track.id} track={track} index={i} />
))}
```

The `key` lets React match items across redraws — it must be stable (`track.id`, never the array index for reorderable lists, or rows shuffle wrongly when items move).

## 7. Where the app's *real* state lives: Zustand

Component state dies with the component. App-wide state — current track, volume, queue, download jobs — lives in **stores**:

```ts
// web/src/store/player.store.ts (abridged)
export const usePlayerStore = create<PlayerState>()(persist((set) => ({
  currentTrack: null,
  volume: 0.8,
  setTrack: (t) => set({ currentTrack: t, savedProgress: 0 }),
}), { name: 'rheoson-player' }))
```

Reading from any component:

```tsx
const isPlaying = usePlayerStore((s) => s.isPlaying)
```

The selector `(s) => s.isPlaying` matters: the component redraws only when *that slice* changes, not on every store write. `persist` middleware saves chosen fields to localStorage — which is why your volume survives an app restart.

The dependency graph here is deliberate and documented in CLAUDE.md: `playerStore` (playback state) ← `queueStore` (what plays next) ← pages/components. When you add app-wide state, find the store that owns that concern instead of creating a parallel one.

## 8. Routing — pages as components

`web/src/router.tsx` maps URL paths to page components. `<BottomNav />` and `<Sidebar />` are just links; `/now-playing` is deliberately *outside* the shell layout (it's a fullscreen sheet). Route params (`/playlist/:id`) arrive via `useParams()`; programmatic navigation via `useNavigate()`.

## 9. Loading, error, empty — the three states every screen owes you

This codebase's convention (visible in Downloads.tsx):

```tsx
{loadingLocal && <Skeleton />}                                    // 1. loading
{!loadingLocal && localCount === 0 && <EmptyState />}             // 2. empty
{!loadingLocal && filteredTracks.length === 0 && <NoResults />}   // 3. filtered-empty
{!loadingLocal && filteredTracks.length > 0 && <List />}          // 4. content
```

A new screen missing one of these four branches is an immediate review comment — guests hit empty states constantly, and a spinner-forever or blank page is the symptom.

## 10. Event handling

```tsx
<button onClick={() => cancel(job.id)}>…</button>
<input onChange={e => setQuery(e.target.value)} />
<div onContextMenu={…} onTouchStart={…}>  {/* custom long-press in useTrackContextMenu */}
```

Handlers are inline arrows that call the imported hook/store actions. Long-press + right-click menus share one hook that attaches multiple listeners and suppresses the ghost click — a good file to study once you're comfortable.

## 11. Composition — how a screen is actually built

The My Music page is real composition in action:

```
Downloads.tsx (page)
├── useDownloads()            ← behavior (hook)
├── useQuery(tracksApi.getAll) ← server cache (TanStack Query)
├── DownloadRow × active jobs ← list of components
├── LibraryTrackRow × library ← list of components
│     └── usePlayerStore, useQueue, useTrackContextMenu
└── ErrorBoundary             ← blast-radius containment
```

Note what the page does *not* contain: no Howler, no WebSocket, no fetch logic. Each concern lives in a hook/store/API module. That separation is the codebase's architecture in miniature (see [05](../05-codebase/architecture.md)).

## Exercises

1. Open `web/src/pages/downloads/Downloads.tsx`. List every hook it calls and write one line each: what state or behavior does it contribute?
2. Find the four rendering states (§9) in `Downloads.tsx` by line number.
3. In `useTrackContextMenu.ts`, explain why the timer lives in a `useRef` and not `useState`. What would go wrong otherwise?
4. Add a "Clear filter" keyboard shortcut: pressing `/` while on My Music focuses the search input. You'll need `useRef`, `useEffect` with a window listener, and the existing input. (This is a real, shippable improvement — 15 lines.)
