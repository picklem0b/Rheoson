# Chapter 6 — Python for the Backend

*Part II · Languages*

---

The backend (`api/`) is Python 3.13, written in a modern idiom: full type hints, `async`/`await` throughout, Pydantic models at the HTTP boundary, and almost no classes. A reader with Chapters 2–5 in hand will find every concept re-expressed here under different spelling. This chapter is that translation, plus the pieces that exist only on this side.

## 6.1 Syntax and structure

Python delimits blocks by indentation rather than braces, names bind without declaration keywords, and the style — four-space indents, `snake_case` names, two blank lines between top-level definitions — is standardized (PEP 8) and enforced by the linter, so style is never a review topic.

```python
# api/app/services/metadata_service.py (abridged)
def _file_id(path: Path) -> str:
    """The identity contract for local files."""
    return hashlib.md5(str(path).encode()).hexdigest()[:16]
```

Docstrings (the triple-quoted line) are the backend's documentation convention — every service and router module opens with one stating its role. Leading underscores mark internal names (`_file_id`, `_jobs`): a social contract that "outside callers should not touch this," which in review carries the same weight as a language-enforced `private`.

## 6.2 The type system, translated

Python's type hints are optional at runtime but enforced here by a checker, and they map one-to-one onto Chapter 5:

| TypeScript | Python | Example |
|---|---|---|
| `x: number` | `x: float` / `int` | `progress: float` |
| `string` | `str` | `track_id: str` |
| `boolean` | `bool` | `is_liked: bool` |
| `T[]` | `list[T]` | `list[Track]` |
| `Record<string, T>` | `dict[str, T]` | `dict[str, Any]` |
| `T \| null` | `T \| None` | `Track \| None` |
| `type X = A \| B` | `X = A \| B` | `RepeatMode = Literal["off","all","one"]` |

The codebase writes modern spelling everywhere — `list[str]` not `List[str]`, `X | None` not `Optional[X]` — and runs the checker in CI. The union-with-`None` is the most consequential: like TypeScript's `?`, it forces every possibly-absent value to be handled, and the backend's long-standing bugs in this class (a stale index read as valid, a missing metadata field crashing a scan) were all cases where `None` snuck past unguarded.

## 6.3 Data structures

The workhorses:

```python
tracks: list[dict] = []                    # ordered collection
jobs: dict[str, dict] = {}                 # keyed lookup — the download job table
seen: set[str] = set()                     # unique membership, O(1) tests
cache: dict[str, Path] = {}                # the stream cache is exactly this
```

Comprehensions are the idiomatic loop — Python's spelling of `map`/`filter`:

```python
titles = [t["title"] for t in tracks if t["is_liked"]]          # map + filter
by_id  = {t["id"]: t for t in tracks}                            # build an index
```

Two collection facts shape correctness here: dicts preserve insertion order (history is an ordered list of events, appended as they happen), and mutation during iteration is a runtime error — functions that prune a cache collect keys first, then delete (the download-job cleanup does exactly this).

## 6.4 Async

Same model as Chapter 2.8, different words: an `async def` function is a *coroutine*; `await` yields control while a result arrives; `asyncio.gather` runs independent awaits together, just like `Promise.all`:

```python
# search fanout — the direct twin of the frontend's Promise.all
songs, albums, artists, playlists = await asyncio.gather(
    search_songs(q), search_albums(q), search_artists(q), search_playlists(q),
)
```

Two Python-specific facts matter in this codebase. First, much of the underlying work is *blocking* — the YTMusic library, file scanning, running yt-dlp. Calling those directly inside `async def` would freeze the whole server for every user, so they are offloaded to a thread pool (`run_in_executor`, the established pattern in `ytmusic_service.py`) or run as subprocesses whose completion is awaited. "Never call a blocking function from the event loop" is the backend's most important async rule, and the wrappers exist to enforce it.

Second, the event loop is single-threaded: coroutines interleave, they do not run in parallel. Shared state needs no locks against true parallelism, but any `await` is a point where another coroutine may have changed shared data — the reason the stream cache rebuild takes a lock (`_cache_lock`) even though Python threads are not the hazard.

## 6.5 Decorators

A decorator wraps a function, adding behavior without rewriting it — written `@name` above the definition:

```python
@router.get("/{track_id}")
async def get_track(track_id: str) -> TrackSchema:
    ...                      # FastAPI turned this into a route
```

Every `@router.get/post/...` in the codebase registers the function below it as an HTTP endpoint: FastAPI inspects the signature to learn the parameters (path pieces, query strings, body models), calls the function per request, and converts the return value to JSON. That signature-driven magic is why backend functions here have fully annotated signatures — the annotations *are* the API definition. Other decorators exist (`@property` for computed attributes on the settings object, `@lru_cache` for memoization) but route registration is the one to read fluently.

## 6.6 Pydantic and the schemas

**Pydantic** models are typed data containers that *validate* on construction — the backend's boundary enforcement:

```python
# api/app/schemas/track_schema.py (abridged)
class TrackSchema(BaseModel):
    id: str
    title: str
    artist: ArtistSchema
    duration: float
    is_liked: bool = False          # default when absent from input
```

Constructing `TrackSchema(**some_dict)` checks every field, coerces compatible types, and raises a structured error listing exactly what was wrong. Every HTTP response model in the API is a Pydantic schema, which is what makes the generated OpenAPI document (and therefore the frontend's generated types, Chapter 5.6) trustworthy. The rule with real incident history behind it: *anything entering from outside — request body, disk file, third-party API — becomes a Pydantic model before the rest of the code touches it.* Unvalidated dicts have caused more backend bugs here than any other single cause.

## 6.7 Modules and project layout

Python modules are files; packages are directories importable by dotted path (`app.services.download_service` is the file `api/app/services/download_service.py`, found because `api/` is on the import path). Imports come at the top, grouped standard-library / third-party / first-party, and the layering is strict:

```
core/ (config, logging, exceptions, deps)   ← imported by everything, imports nothing app-level
services/                                   ← business logic; imports core
routers/                                    ← thin HTTP shells; import services + schemas
websocket/                                  ← event push; wraps Socket.IO
main.py                                     ← assembly: app, routers, cron, startup
```

The one-directional arrow ("routers import services; services never import routers") is what keeps the backend testable — Chapter 16's tests import services directly with a fake database and no HTTP layer at all.

## 6.8 The standard toolkit

Functions and shapes that recur; recognizing them is backend reading fluency:

```python
path = Path(MUSIC_DIR) / artist / f"{title}.{ext}"    # pathlib — path math without strings
for p in Path(MUSIC_DIR).rglob("*.mp3"): ...          # recursive walk for the library scan
json.loads(raw) / json.dumps(obj)                      # the JSON sidecars' I/O
with open(p, "r", encoding="utf-8") as f: ...          # context manager: file closes on any exit
```

`with` blocks deserve a note: they acquire a resource and guarantee release on success *or* exception — the backend uses them for files, locks (`async with _cache_lock:`), and database sessions alike. Forgetting one is a resource leak the OS eventually punishes, so in review an unclosed acquisition is a finding even when "it works."

## 6.9 Exceptions

Chapter 2.9's discipline, Python spelling. The hierarchy in `api/app/core/exceptions.py` roots at `RheosonException` and subclasses per domain (`SearchError`, `DownloadError`), each carrying an HTTP status; one exception handler translates any of them to a JSON response. Services raise; routers never try/except what the handler already covers. The anti-patterns with teeth in this codebase: bare `except:` (catches `KeyboardInterrupt`, hides bugs), and `except Exception: pass` (the swallowed error that becomes a mystery days later). The sanctioned exceptions to both are narrow — cleanup paths that must run regardless, logged loudly when they do.

## 6.10 Reading a service, end to end

Bringing the chapter together with the file every backend change eventually touches — the download service's core loop, reduced to its skeleton:

```python
async def _run_download(job_id: str) -> None:
    job = _jobs[job_id]                       # in-memory state (Chapter 1.3)
    async with _sem:                          # concurrency cap (6.4: awaits are interleaving points)
        result = await run_in_executor(ydl.extract_info, url)   # blocking work off the loop
    dest = Path(settings.MUSIC_DIR) / artist / filename        # pathlib (6.8)
    await metadata.write_tags(dest, meta)     # service composition (6.7 layering)
    stream.invalidate_cache(); tracks.invalidate_index()       # the invalidation chain (Chapter 9)
    ws.emit_download_done(job_id, str(dest))  # push, not poll (Chapter 3.5)
```

Every line is a chapter concept, and the whole shape — validate, work under a bound, persist, invalidate, notify — is the template most backend features here follow.

## Exercises

1. Translate to idiomatic Python: `const active = jobs.filter(j => j.status === "active").map(j => j.id)`.
2. `ytmusic.search(q)` is blocking. Write the two-line wrapper that makes it safe to call from a route handler, and explain what breaks without it.
3. Find the `async with _sem:` in the download service. What is the semaphore's count, where is it configured, and what user-visible behavior would change at 1? At 100?
4. A schema field is renamed in `track_schema.py`. List, in order, everything that must be regenerated or updated before the frontend build passes again.
5. The job cleanup prunes a dict while iterating candidate keys. Find it and explain the collect-then-delete pattern from 6.3.
