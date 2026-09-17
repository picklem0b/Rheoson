# Code Pattern Recognition — How to Read This Codebase

*Stage 15. A reference of shapes that repeat here. Learn to *name* them and code stops being noise.*

## 1. `const items = data.map(...)` — transform a list

```ts
// real shape, everywhere
const rows = filteredTracks.map((track, i) => (
  <LibraryTrackRow key={track.id} track={track} index={i} />
))
```

**Means:** one output item per input item, in order. **Review for:** the `key` (stable id, not index — unless the list never reorders), and whether the callback is pure (no side effects in `map`).

## 2. Copy-then-override — drift guards

```ts
// web/src/pages/downloads/components/DownloadRow.tsx
const job = {
  ...jobProp,
  title: jobProp.title ?? 'Untitled',
  progress: typeof jobProp.progress === 'number' ? jobProp.progress : 0,
}
```

**Means:** "data from an older build/cache may be missing fields; render anyway." Recognized by a spread immediately followed by `?? default` lines. If you add a stored field, add its guard here — that's the pattern's whole maintenance cost.

## 3. Optional chain + nullish fallback — the safety pair

```ts
const artistName = track.artist?.name ?? 'Unknown Artist'
```

**Means:** the full chain short-circuits if *any* link is missing; `??` supplies the display fallback. In review, distinguish from `||`: `??` keeps `0`/`''`/`false` as real values.

## 4. Guard clauses — return early

```ts
if (!d.id) return                    // not our event
if (job.status !== 'downloading') return ''   // nothing to show
// happy path un-indented below
```

**Means:** handle the unusual case first and bail. Review for: the guard *must* come before any work, and early returns need no `else`.

## 5. The Zustand slice selector

```ts
const isPlaying = usePlayerStore((s) => s.isPlaying)
```

**Means:** subscribe to *one field*. The arrow must return the field, not the store. Anti-pattern to flag: `const s = usePlayerStore()` — subscribes to everything, re-renders on any change.

## 6. Custom hook as feature facade

```ts
const { jobs, activeJobs, download, cancel, retry, resume, clearDone } = useDownloads()
```

**Means:** all behavior for one feature, one import. The component calls; the hook owns state/effects/ws/api. When you extend a feature, extend its hook first — the component should rarely need new logic.

## 7. Typed API wrapper — one endpoint, one function

```ts
// web/src/api/tracks.api.ts (shape)
export async function getTrending(limit = 20): Promise<Track[]> {
  return api.get<Track[]>(`/tracks/trending?limit=${limit}`)
}
```

**Means:** URL strings appear in exactly one file per endpoint. Review for: the generic (`<Track[]>`) matching the backend schema, and query params encoded, not string-concatenated with user input.

## 8. TanStack Query trio

```ts
const { data, isLoading } = useQuery({
  queryKey: ['tracks', 'all'],
  queryFn: tracksApi.getAll,
  staleTime: 10_000,
})
```

**Means:** server-cache with loading state. `queryKey` is the cache address — invalidate it after a mutation: `queryClient.invalidateQueries({ queryKey: ['tracks'] })`. Recognize: missing `staleTime` = refetch storms; wrong key = stale UI.

## 9. useEffect subscribe/cleanup pair

```ts
useEffect(() => {
  ws.on('download:progress', onProgress)
  return () => ws.off('download:progress', onProgress)
}, [updateJob])
```

**Means:** the return function is the *unsubscription*, run on unmount/re-run. Review for: cleanup present, dependency array honest (every captured variable listed).

## 10. FastAPI route with optional auth

```python
@router.get("/trending")
async def get_trending(limit: int = 20, _user: dict | None = Depends(get_optional_user)):
```

**Means:** guests allowed (policy matrix). `_user` prefixed with `_` = deliberately unused. The strict variant `Depends(get_current_user)` means 401 for guests — both are *choices*, pinned by tests, never accidental.

## 11. Pydantic schema as contract

```python
class BatchDownloadRequest(BaseModel):
    track_ids: list[str]
    format: str = "mp3"
```

**Means:** FastAPI validates + documents + serializes. Review for: limits (`max_length`, `le=`) on anything size-shaped — unbounded lists are an abuse surface.

## 12. Service singleton with a lock

```python
_ytm_lock = asyncio.Lock()

async def get_client():
    async with _ytm_lock:
        if _client is None:
            _client = build_client()
        return _client
```

**Means:** expensive resource built once; the lock stops a thundering herd of concurrent builds. Similar: the download semaphore. Review for: every access going through the getter, never the bare global.

## 13. Cache-then-invalidate

```python
# read-through cache
idx = _track_index or await _build_index()
# …and after any write that changes the world:
invalidate_track_index()
invalidate_stream_cache()
```

**Means:** derived data is cached until its source changes. The classic Rheoson bug: a download finishes, caches aren't invalidated, the track is invisible until restart. If your PR writes files/db state, hunt the invalidation chain (CLAUDE.md documents it).

## 14. Structured log line

```python
log.info("stream.relay.cached", track_id=track_id, size=size)
```

**Means:** `event` + fields, greppable, no prose. Review for: no secrets in fields, request_id correlation.

## 15. Test-as-matrix (parametrize)

```python
@pytest.mark.parametrize("method,path,body", STRICT_ANON)
async def test_account_endpoints_refuse_anonymous(client_anon, method, path, body):
```

**Means:** one rule, many inputs, each failure named. Frontend twin: table-driven `it.each(...)`-style cases. Recognize: the test *name states the rule*; the table is just data.

## 16. The generated-contract refresh

```bash
uv run python scripts/export_openapi.py          # backend → openapi.json
npx openapi-typescript src/types/openapi.json -o src/types/api-generated.ts
```

**Means:** frontend types are *derived*, never hand-edited. Any PR touching a response shape must include the regenerated files — that's why they appear in almost every API diff.

---

Quick self-test: open any random file in `web/src` or `api/app`, point at five lines, and name the pattern in each. If you can do that for three files in a row, you're reading the codebase, not decoding it.
