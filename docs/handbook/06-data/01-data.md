# Chapter 10 — Data: MongoDB and On-Disk Files

*Part III · The Codebase*

---

Rheoson deliberately splits its data between a document database and plain files, choosing the cheapest durable home for each kind of state. This chapter covers what a document database is, the actual collections and sidecars in this project, and the cache-and-identity layer that turns files into a browsable library. The deciding question throughout: *who writes this, how often, and how must it be queried?*

## 10.1 What a database buys

A **database** is a program that owns three hard problems so application code does not have to: durability (a crash mid-write leaves valid data), concurrent access (two writers cannot corrupt each other), and querying (find, filter, aggregate without loading everything). Files solve none of these well past a single writer, which is exactly the trade this project makes knowingly — and the boundary where it switches tools is explicit.

**MongoDB** is a *document* database: data lives as JSON-like **documents** grouped into **collections** (the analogs of rows and tables in relational systems). Documents in one collection may differ in shape; related data is either embedded or referenced by ID; and queries are expressed in the same JSON-like language. The project chose it over relational databases because its account-level data (users, signals, profiles) is naturally document-shaped and needed no cross-entity joins.

## 10.2 MongoDB as used here

The backend talks to Atlas (managed MongoDB) through **Motor**, the async driver — every call is awaited, so database latency never blocks the event loop (6.4's rule applied to the slowest dependency the app has). The client lives behind one module; layers above it see repository functions, never raw collections.

One operational property is deliberate: **the database is optional at startup.** If Atlas is unreachable the process still boots, and every file-backed feature (streaming, library, playlists, likes) works; DB-dependent routes answer 503 with a clear message instead of dying. A self-hosted app that refuses to start because a cloud dependency blinked would be a worse product.

## 10.3 The collections

| Collection | Document shape | Written by | Notes |
|---|---|---|---|
| `users` | identity, email, timestamps, preferences subdocument | auth flows, webhooks | one per account; preferences synced across devices |
| `signals` | `{user, type, track, weight, at}` | playback events | append-only; the raw material for everything below |
| `taste_profiles` | per-user aggregates: top artists/genres, recency scores | recommendation engine | rebuilt from signals; the only stateful analytics |
| `recommendation_sections` | curated + generated home sections | recommendation engine | ordered; cached until library changes |
| `visitor_counts` | counters for guest/authed visits | guest-visit endpoint | the landing page counter |

Query patterns in actual use are few and worth reading once: field equality with a user filter (the default access control — every per-user query *must* carry the user, or it is a cross-user data leak, the review check with no exceptions); `find().sort(field, -1).limit(n)` for "top N" aggregates; and atomic `$inc`/`$set` updates for counters and preference merges so concurrent writers cannot lose each other's writes. Indexes exist on every lookup field (user IDs, track IDs, timestamps); a query in review that filters on an unindexed field of a growing collection is a finding, because the fix compounds with data size.

The **migration story** is deliberately light: document databases accept shape drift, so the codebase evolves schemas by tolerating old fields and defaulting new ones on read — with Pydantic models (6.6) as the enforcement point on the way in and out. The one hard rule: *new fields need defaults*, or every pre-existing document fails validation on next read.

## 10.4 The on-disk sidecars

Small, single-writer, per-instance state lives as JSON files under `MUSIC_DIR` — readable in any editor, trivially backed up by copying the music folder, and exactly right for one user on one device:

| File | Shape | Written by |
|---|---|---|
| `.liked.json` | `string[]` — track IDs | like/unlike endpoints |
| `.history.json` | `[{id, playedAt}]`, capped at 200 | the record-play endpoint |
| `.playlists.json` | `{[id]: playlist}` | playlist CRUD |
| `.download_jobs.json` | completed/failed job records | the download service |
| `track_identity.db` | SQLite: videoId ↔ downloaded file mapping | the download service |

The last two are the interesting ones. The **jobs file** is the persistence half of Chapter 9.6's split: in-flight progress stays in memory because it is ephemeral, while terminal states (done, error) cross to disk so the activity feed survives restarts. The **identity sidecar** solves the project's deepest data problem: a track's ID changes when it becomes a local file (YouTube ID before, path hash after — Chapter 9.3's contract), and the SQLite mapping lets likes, history, and playlists keep resolving across that transition. Writes to every sidecar are serialized by the writing service and always *replace the whole file* after a full serialization — no partial writes, no merge logic, acceptable precisely because each file has one writer and stays small.

## 10.5 The derived layer: caches and indexes

The track "database" most code paths actually read is neither MongoDB nor a sidecar but an **index built by scanning disk**: `track_router` walks `MUSIC_DIR` recursively, reads every audio file's tags through the metadata service, and holds the result in memory as a dict keyed by file ID. `None` means stale; any writer that changes the library sets it to `None`, and the next reader rebuilds it. The stream cache (9.5) follows the same pattern one tier down, with a lock around rebuilds and a durable tee so warm plays skip resolve entirely.

The **invalidation chain** from Chapter 9.6 is this section's one-line summary: *every writer invalidates every cache it can make stale, immediately, in the same code path.* The failure mode when that discipline slips is documented and tested: a download that "succeeds" but does not appear anywhere until restart. Two functions, two call sites, one chain — the shortest durability story in the codebase and the one most worth memorizing.

## 10.6 Choosing a home for new state

The decision table new features are held against:

| Question | Yes → |
|---|---|
| Per-user, queryable, grows unboundedly, multi-entity? | MongoDB collection |
| Per-instance, small, one writer, human-inspectable? | JSON sidecar |
| Derived from other data, rebuildable? | in-memory cache + invalidation |
| Ephemeral, per-connection? | memory + push (never persisted) |
| The track identity itself? | the SQLite sidecar — with a migration plan |

The table's hidden fifth row is the most important: anything answerable by *deriving* should not be stored at all. Play counts, top artists, streaks — all are computed from `signals` at request time (or cached briefly), because stored aggregates go stale and derived values cannot. When a feature request says "save X," the first question is always whether X can be derived from what already exists.

## Exercises

1. For each, choose a home from 10.6 and justify in one sentence: per-device equalizer settings; a global "most downloaded" chart; a user's liked tracks; a running download's percentage.
2. The users collection gains a required `country` field. Per 10.3's rule, what must accompany the change, and what breaks without it?
3. Find one `$inc` or `$set` update in the code. What concurrent-writer problem does the atomic update prevent?
4. Delete `.playlists.json` (in a scratch copy of `MUSIC_DIR`) and boot the backend. What does the playlists list return, and which code path produced that answer?
5. Trace one play event from the record-play endpoint into `signals` and out again as a home-screen recommendation, naming every store it touches.
