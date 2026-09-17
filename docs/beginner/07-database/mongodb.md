# Database — MongoDB in This Project

*Stage 7. Rheoson uses **MongoDB** (via the async `motor` driver) for everything account-scoped, and plain files for everything device-scoped. This document explains both, from zero.*

## 1. What a database is (and when you don't need one)

A database is a program that stores data *reliably* — safely across restarts, efficiently at scale, queryable without loading everything. Rheoson is a **single-user-first** app, so many things deliberately don't need a database: music files are files, the track index is rebuilt from disk, playlists started life as a JSON file. What *does* need Mongo: anything tied to an **account** that must survive and be queried per user.

| Data | Storage | Why |
|---|---|---|
| Users, preferences | MongoDB `users` | per-account, queried by sub |
| Likes, dislikes | MongoDB `liked_tracks` + per-user JSON fallback | queried per user |
| Play history, signals | `listening_history`, `user_signals` | appended, aggregated (top artists) |
| Taste profiles, recommendations | `taste_profiles`, `user_recommendations` | computed + read per user |
| Visitor counter | `visitors` | atomic `$inc` |
| Music files | disk (`MUSIC_DIR`) | they're files |
| Stream cache | disk (`STREAM_CACHE_DIR`) | they're files |
| Track identity map | SQLite sidecar | local, embedded, zero-config |

## 2. Mongo vocabulary → SQL vocabulary

| MongoDB | SQL world | Rheoson example |
|---|---|---|
| database | database | `rheoson` |
| collection | table | `listening_history` |
| document | row | one `{user_id, track_id, timestamp}` |
| field | column | `track_id` |
| `_id` | primary key | auto-generated or `"counter"` |
| query filter | WHERE | `{"user_id": "user_123"}` |
| `$set` | UPDATE … SET | `{"$set": {"volume": 0.5}}` |
| `$inc` | UPDATE x = x + 1 | visitor counter |

The connection lives in `api/app/core/database.py`; the URL comes from `MONGODB_URL` (local `mongodb://localhost:27017` in dev, Atlas `mongodb+srv://…` in prod).

## 3. Reading and writing — the actual patterns

```python
# find one document
doc = await db.visitors.find_one({"_id": "counter"})

# find many (async cursor)
cursor = db.listening_history.find({"user_id": user_id})
rows = await cursor.to_list(200)

# insert
await db.users.insert_one({"_id": user_id, "email": email})

# upsert: update if exists, insert if not — used everywhere
await db.users.update_one(
    {"_id": user_id},
    {"$set": {"preferences.autoplay": True}},
    upsert=True,
)

# atomic increment — the visitor counter
await db.visitors.update_one(
    {"_id": "counter"},
    {"$inc": {"authed": 1}, "$set": {"updated_at": now}},
    upsert=True,
)

# aggregation: counts per track (top tracks)
pipeline = [
    {"$match": {"user_id": user_id}},
    {"$group": {"_id": "$track_id", "plays": {"$sum": 1}}},
    {"$sort": {"plays": -1}},
    {"$limit": 10},
]
top = await db.listening_history.aggregate(pipeline).to_list(10)
```

**Pipelines** are Mongo's GROUP BY: `$match` (filter) → `$group` (count/sum) → `$sort` → `$limit`. The analytics endpoints are mostly pipelines in a trenchcoat.

## 4. Relationships — by reference, resolved in code

Mongo has no JOINs. Documents reference each other by id, and *the application* stitches them together. Rheoson's signature example: history and playlists store **track ids**, not track objects. Serving a playlist means: fetch the id list → hydrate each id (concurrently) into full `Track` objects from the index/YouTube. That's why "add a track to a playlist" stores 11 characters, and why hydration failures are the first suspect when a playlist shows gaps.

## 5. How the app degrades without Mongo

`db_available()` is checked before every Mongo touch; on failure the file-backed fallbacks take over (`.liked-<sub>.json`, `.history-<sub>.json` in `MUSIC_DIR`). This is why the app *starts* without a database: guests and local features keep working, account features answer honestly instead of 500ing. Review habit: **every Mongo call sits inside `if db_available()` or `try/except`** — a bare call is a bug.

## 6. Per-user isolation — the security boundary

Every query that touches user data filters by `user_id` from the verified token (`user["sub"]`), never from the request body. The test suite proves it: `test_auth_guard.py` signs in two users and asserts A's likes/playlist/history are invisible to B. When you add a user-scoped collection, the checklist is: filter by `sub` on **every** read and write, add isolation tests, and decide the guest story (fallback file? empty? 401?).

## 7. Schema changes ("migrations")

Mongo is schemaless: old documents simply lack new fields. The convention here is defensive reads (`doc.get("field", default)`) plus targeted backfills where a default matters (the preferences service fills defaults on read). There is no migration framework to learn — but there *is* a rule: **new fields must be optional on read** or every pre-existing document breaks the feature that expects them.

## 8. The mock in tests

Tests never touch a real Mongo: `api/tests/conftest.py` swaps in an in-memory `MockDatabase` supporting `find_one`, `find`, `insert_one`, `update_one` (including dotted paths), `delete_one`, `count_documents` and enough of `aggregate` for the analytics tests. When a test fails with weird Mongo behavior, check whether the mock supports the operator you just used — extending the mock is a normal contribution.

## Exercises

1. Start the backend with a local `mongod` (or point `MONGODB_URL` at Atlas). Create a playlist, then inspect it: `mongosh` → `use rheoson` → `db.playlists.find().pretty()`.
2. Find the visitor-counter code in `auth_router.py`. Why `$inc` instead of read-then-write? (What breaks with two simultaneous visitors?)
3. Trace `GET /api/tracks/liked` from router to Mongo to hydration. Where is the file fallback?
4. Write (don't ship) the query for "tracks this user played in the last 7 days, newest first." Which index would it want?
