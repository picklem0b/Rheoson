# Code Review Training — A Graded Curriculum

*Stage 16. Seven levels, each with exercises to try **before** reading the solutions (they're at the bottom, and honest). All code is from or modeled on this repo.*

**How to practice:** for each exercise, write down (1) what's wrong, (2) why it matters, (3) the fix you'd propose. Then check. Wrong guesses are the curriculum working.

---

## Level 1 — Spot the syntax mistake

**1a.**
```ts
const downloadedCount = localTracks.filter(t => t.isDownloaded.length
```
**1b.**
```python
@app.get("/api/tracks/trending"
async def get_trending(limit: int = 20):
```
**1c.**
```ts
if (job.status = 'error') { showRetry() }
```

## Level 2 — Explain what this does

**2a.**
```ts
const total = jobs.reduce((acc, j) => acc + (j.status === 'done' ? 1 : 0), 0)
```
**2b.**
```python
tracks.sort(key=lambda t: (int(t.get("album", {}).get("trackNumber") or 0), t.get("title", "").lower()))
```
**2c.**
```ts
const target = resolveApiTarget({ rawApiUrl, isDev, isNative, pageOrigin })
```
What does the *return value shape* let callers do without knowing the decision logic?

## Level 3 — Find the obvious bug

**3a.** The queue skips a track on shuffle:
```ts
function next(isShuffled: boolean) {
  if (isShuffled) {
    const i = Math.floor(Math.random() * queue.length)
    queue.shift()
    return queue[i]
  }
  return queue.shift()
}
```
**3b.** Progress sticks at a weird value:
```ts
const pct = downloadedBytes / totalBytes * 100
```
**3c.** Some users never see the offline banner:
```ts
if (!navigator.onLine) showBanner()
```
(Hint: who calls this, and when?)

## Level 4 — Find the bad pattern

**4a.**
```ts
const all = usePlayerStore()
```
**4b.**
```tsx
{tracks.map((t, i) => <Row key={i} track={t} index={i} />)}
```
(the list supports drag-reorder)
**4c.**
```ts
useEffect(() => {
  ws.on('download:progress', onProgress)
}, [])
```
**4d.**
```python
async def start_download(req, user=Depends(get_current_user)):
    track = await db.tracks.find_one({"user_id": req.user_id})
```

## Level 5 — Review a small feature (a real PR shape)

> **PR title:** `feat(downloads): remember last used format`
> Body: "Users pick m4a every time; remember it."

**Diff:**
```ts
// store/download.store.ts
+ defaults: { format: 'mp3' },
+ setDefaultFormat: (f) => set({ defaults: { ...defaults, format: f } }),

// components/ui/DownloadModal.tsx
- const [format, setFormat] = useState('mp3')
+ const [format, setFormat] = useState(useDownloadStore(s => s.defaults.format))
+ useEffect(() => { setDefaultFormat(format) }, [format])
```

Review it fully: correctness, hooks rules, persistence (does it survive restarts? the store isn't `persist`ed — is that intended?), naming, tests, docs. List every change you'd request, ranked.

## Level 6 — Review an actual project change

`git show v2.17.10` — read the tag message, then `git show v2.17.10 --stat` and pick the My Music crash fix commit. Review it as a reviewer: does the native fix cover *all* the throwing paths? Is the web drift-guard pattern applied consistently? What would you have tested that isn't tested? Write the review a maintainer would want: questions first, then suggestions, then nits.

## Level 7 — Full PR review simulation

Reconstruct the guest-policy restore (`git log --oneline --grep="guest-first" -i`, then the commit). Produce a real review: summary of what changed, the policy table it implements (guest / authed / invalid-token), risks (what could break that the tests don't cover), docs touched (should `docs/API.md` change? CLAUDE.md?), and your verdict with merge-blocking vs nice-to-have comments.

---
---

## Solutions & explanations

### Level 1
- **1a** — missing closing paren on `filter(...)`; also likely meant `t.isDownloaded` (property) not `t.isDownloaded.length`. `tsc` catches the first; the second is a *logic* error the compiler can't know.
- **1b** — missing `)` on the decorator line; Python's error will point at the *next* line (`async def`) — decorators' errors read one line late.
- **1c** — `=` assigns; `===` compares. `job.status` becomes `'error'` (truthy), so the branch always runs. The classic; eslint's `no-cond-assign` exists for exactly this.

### Level 2
- **2a** — counts done jobs: starts at 0, adds 1 per done job. Read `reduce` as "fold the list into one value."
- **2b** — sorts by album track number (missing → 0 via `or 0`), ties broken by lowercase title. The tuple key = primary/secondary sort.
- **2c** — returns `{ origin, source }`; callers just use `origin` and *optionally* show the `source` in diagnostics. The shape hides the env/prod/native decision tree — that's the point.

### Level 3
- **3a** — `shift()` runs *before* indexing, so `queue[i]` reads one past the intended position (and skips). Also mutates the store array in place. Fix: pick the index first, slice a new array, and take the item — no shift.
- **3b** — `totalBytes` can be 0/unknown (HLS) → `Infinity`/`NaN`. Guard: only compute when `totalBytes > 0`, else show indeterminate.
- **3c** — `navigator.onLine` is checked once, at mount. It's an *event*, not a state: needs `online`/`offline` listeners plus a real probe (that's exactly why `lib/network.ts` polls the health endpoint — `navigator.onLine` says "an adapter exists", not "the API is reachable").

### Level 4
- **4a** — subscribes to the whole store; re-renders on any change. Select the fields you use.
- **4b** — index keys with reordering = wrong rows animate/match. Use `t.id`.
- **4c** — no cleanup: every remount adds another listener (progress events then fire N times). Return `() => ws.off(...)`.
- **4d** — trusts `req.user_id` from the body instead of `user["sub"]` from the token = identity spoofing. Always derive the user from verified auth.

### Level 5 (ranked)
1. **Blocking:** `useState(useDownloadStore(...))` — hooks inside hooks expressions are legal here but the value is captured once and never syncs; and the `useEffect` writes back on mount, fighting itself. Correct shape: read via `const saved = useDownloadStore(s => s.defaults.format)`, `useState(saved ?? 'mp3')`, and write back only on *explicit user choice* (onChange), not in an effect.
2. **Blocking:** persistence — the feature's entire point is remembering across restarts; the store needs `persist` for that field (see how `playerStore` persists volume).
3. **Major:** no test (e.g., modal opens with remembered format; changing it updates the store).
4. **Nit:** `defaults` is vague — `preferredFormat` says the thing.

### Level 6/7 — no fixed answers; a good review here cites the *behavior* risk (backgrounded stop path), the *policy* matrix as tests, and asks what pins the Java side (it can't run in CI — so what compensates? Code review + device test plan).
