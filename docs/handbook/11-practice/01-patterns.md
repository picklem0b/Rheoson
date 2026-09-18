# Chapter 19 — Reading Existing Code

*Part V · Reference*

---

Fluency in a codebase is pattern recognition: after enough examples, a shape is recognized before it is read. This chapter is the catalogue — the recurring shapes of this repository, what each means, why it exists, and what to check when it appears in review. Cross-references point to the chapter that teaches the underlying concept.

## 19.1 Data transformation chains

**The shape** — `map`/`filter`/`find` composed into a pipeline:

```ts
const playable = tracks.filter((t) => t.isDownloaded);
const rows = playable.map((t) => ({ id: t.id, title: t.title, art: t.artworkUrl }));
```

*Means*: derive a render model from data — never mutate the source (7.3). *Check in review*: a `sort` or `reverse` anywhere in the chain (mutates in place, 4.4); a chain over a prop or store array without a copy first.

**The shape** — `reduce` into an aggregate:

```ts
const counts = events.reduce((acc, e) => { acc[e.id] = (acc[e.id] ?? 0) + 1; return acc; }, {});
```

*Means*: build an index or sum from a stream — the analytics paths run on this. *Check*: the accumulator's initial value (wrong shape here poisons everything downstream), and whether a plain loop would honestly be clearer.

**Python twin** — comprehensions (6.3): `[t for t in tracks if t.is_liked]`, `{t.id: t for t in tracks}`. Same meanings, different spelling.

## 19.2 Absence handling

**The shape** — the guard pair:

```ts
const name = track?.artist?.name ?? "Unknown artist";
```

*Means*: data from a boundary (API, storage, socket) may be incomplete; this renders anyway (5.3, and the Downloads crash that made it policy). *Check*: `||` where `??` belongs (4.7's `0`/`""` trap); a guard that hides an *unexpected* null instead of shaping a *known-optional* one — the first is a bug mask, the second is correctness.

**The shape** — early return:

```ts
if (!trackId) return;
```

*Means*: guard clauses keep the happy path flat (2.3). *Check*: guards after side effects instead of before.

## 19.3 Async shapes

**The shape** — fanout:

```ts
const [a, b, c] = await Promise.all([fA(), fB(), fC()]);
```

```python
a, b, c = await asyncio.gather(fA(), fB(), fC())
```

*Means*: independent work in parallel (4.9, 6.4). *Check*: are the tasks actually independent? A shared resource or a rate-limited endpoint can turn "parallel" into a thundering herd — the search fanout's semaphore exists for exactly that.

**The shape** — `allSettled` for partial tolerance:

*Means*: one failure must not erase the rest (playlist hydration). *Check*: whether callers distinguish fulfilled from rejected — treating them alike recreates all-or-nothing.

**The shape** — the effect with cleanup:

```tsx
useEffect(() => {
  let cancelled = false;
  load(id).then((d) => { if (!cancelled) setData(d); });
  return () => { cancelled = true; };
}, [id]);
```

*Means*: fetch synchronization with stale-response protection (7.4). *Check*: dependency completeness; a missing cleanup for any subscription or timer in the body.

## 19.4 React component shapes

**The shape** — the store-selector pair:

```ts
const volume = usePlayerStore((s) => s.volume);
const setVolume = usePlayerStore((s) => s.setVolume);
```

*Means*: subscribe narrowly; actions come from the store, not from re-implementations (7.13). *Check*: whole-store subscriptions (re-render storms) and components computing what a store action already implements.

**The shape** — the module-singleton behind a hook:

*Means*: stateful engines (audio) live outside React (7.7). *Check*: any React state that tries to hold the engine itself — the double-mount double-play bug class.

**The shape** — the four-state page skeleton (7.14): states first, happy path last. *Check*: a page with loading and no empty state, the most common incompleteness.

## 19.5 State-management shapes

**The shape** — replace, don't mutate:

```ts
setQueue([current, ...rest]);      // ✔
queue.unshift(current);            // ✘ invisible to React and to persistence
```

*Means*: reference identity drives re-render (7.3). *Check*: any `push`/`splice` on state arrays.

**The shape** — the discriminated union:

```ts
type Job = { status: "active"; pct: number } | { status: "error"; message: string };
```

*Means*: impossible states made unrepresentable (5.4). *Check*: boolean fields that must never coexist — the smell this replaces.

## 19.6 Backend shapes

**The shape** — the thin route:

```python
@router.get("/{track_id}")
async def get_track(track_id: str, user = Depends(get_optional_user)):
    return await track_service.get(track_id)
```

*Means*: validate → delegate → respond (9.2). *Check*: any logic in the body beyond delegation; a missing dependency for identity on an endpoint the matrix says needs it.

**The shape** — executor offload:

```python
result = await run_in_executor(blocking_fn, arg)
```

*Means*: blocking work off the event loop (6.4). *Check*: any direct call to a known-blocking library inside `async def` — the freeze-the-server bug.

**The shape** — raise named, handle high:

```python
raise SearchError("YouTube Music unavailable")
```

*Means*: services raise typed errors; one handler converts them to responses (2.9, 6.9). *Check*: `except Exception: pass` — the swallower; and bare `except:` which catches even interrupts.

**The shape** — collect, then delete:

```python
stale = [k for k, v in jobs.items() if expired(v)]
for k in stale: del jobs[k]
```

*Means*: mutation during iteration is a runtime error (6.3). *Check*: `del` inside the comprehension's own loop.

## 19.7 Boundary and configuration shapes

**The shape** — validate at the door:

```python
class TrackSchema(BaseModel): ...
TrackSchema(**payload)     # raises with a field-by-field report
```

*Means*: nothing enters untyped (6.6). *Check*: any code constructing dicts for the API by hand that bypasses the schema.

**The shape** — typed environment:

*Means*: configuration is declared once, typed, documented (3.7, 8.6). *Check*: raw `os.environ[...]` or `import.meta.env` reads outside the config modules.

**The shape** — invalidate on write:

```python
stream.invalidate_cache(); tracks.invalidate_index()
```

*Means*: writers own their caches' staleness (9.6, 10.5). *Check*: a write path touching library state without the chain — the invisible-until-restart bug.

## 19.8 Test shapes

**The shape** — the sentence test:

```python
async def test_liked_requires_identity(client_anon):
    res = await client_anon.post("/api/tracks/dQw4w9WgXcQ/like")
    assert res.status_code == 401
```

*Means*: one behavior, named as a sentence (16.2). *Check*: tests with no assertion, tests that depend on order, and tests whose names describe mechanics ("test_helper_2") rather than promises.

**The shape** — the guard-shape test (frontend):

```ts
expect(formatDuration(NaN)).toBe("0:00");
```

*Means*: boundary guards are pinned, not assumed. *Check*: a guard clause in source with no test — the gap reviewers ask about first.

## Exercises

1. Pick any page component and label every pattern from this chapter it uses. Two labels are expected to repeat; which?
2. Find one shape *not* in this chapter — something recurring the catalogue missed. Write its entry in the chapter's format.
3. The 19.6 "collect, then delete" shape: find the real instance and prove (by comment) what exception the naive version would raise.
4. Take a recent review finding (or a bug from Chapter 15's exercises) and name the pattern that would have prevented it.
5. Write the one-sentence "means" for the module-singleton shape without looking — then check it against 7.7.
