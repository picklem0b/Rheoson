# Deep Dive — Data & Database

> Companion pages: [Architecture](ARCHITECTURE.md), [Auth & Security](AUTH.md) (user isolation). Exact index definitions live in `api/app/core/database.py`.

## Two stores, one principle

Rheoson's state is split by a single rule: **the music library must work with zero infrastructure; account features may require a database.**

| Store | Contents | Without MongoDB |
|-------|----------|-----------------|
| **File-backed** (music directories) | Library files, per-user likes/history/playlists mirrors, track-identity bridge, download job history | Fully functional — the app is entirely usable |
| **MongoDB** (Motor, async) | Users, recommendation signals/profiles, analytics aggregates, visitors | Those endpoints return clean `503`s; everything else keeps working |

## MongoDB

Connection lifecycle (managed in `connect_db`/`close_db`):

- Bounded connect/server-selection timeouts so a down database never blocks startup.
- Indexes created at connect time for every hot query path: unique user email, per-user playlist/likes/history lookups, compound recommendation-signal indexes (user+time, user+signal+time, user+artist, user+track), unique taste profile per user.
- `get_db()` raises a clean `503` dependency error when unavailable — endpoints never crash on a missing DB.
- Connection strings are redacted before logging.

### Collections

| Collection | Purpose | Keyed by |
|------------|---------|----------|
| `users` | Clerk-synced profile, preferences, stats | Clerk user ID (`_id`) |
| `playlists` | DB-backed playlist mirrors | `user_id` |
| `liked_tracks` / `listening_history` | Per-user signals for analytics | `user_id` |
| `user_signals` | Raw recommendation events (play/like/dislike/skip) | `user_id` + compound indexes |
| `taste_profiles` | Aggregated preferences; drives mixes/radio/onboarding | `user_id` (unique) |
| `user_recommendations` | Materialized recommendation sets | `user_id` (unique) |
| `visitors` | Aggregate visitor counter | `_id` |

## File-backed stores

Stored inside the music directory, one file per user per kind:

- Likes, play history, and playlist mirrors — JSON, written atomically on every mutation.
- The download job history — JSON, bounded by a cron trim.
- **Track identity bridge** — a small SQLite database mapping video IDs ↔ file IDs. This is what makes a downloaded track keep its likes, play counts, and history when the library is rescanned or files are renamed. The bridge is invalidated/refreshed by the cron library scan.

These stores are the reason the app degrades gracefully: likes, playlists, history, downloads, and streaming all function on a machine with no database at all.

## Library indexing

- The track index is built by walking configured music directories (`MUSIC_DIR` + extras that exist on disk), reading tags via mutagen, and deriving stable file IDs.
- The stream router keeps its own in-memory path index keyed by the same file IDs.
- Indexes are invalidated (never stale-serving) by: download completion, settings rescan, and the cron library scan. Rebuilds happen under a lock so concurrent requests can't thrash.

## Consistency model

Honest trade-offs, by design:

- Per-user JSON stores are last-write-wins; concurrent writes from the same account on two devices resolve to whichever landed last (no CRDTs).
- MongoDB writes are best-effort for analytics; a failed signal write is logged, never fatal.
- The identity bridge is the durability anchor: as long as a file's identity mapping survives, user data attached to that track survives.

## Backups

To reconstruct a full deployment: copy the music directories (which include the JSON stores and the SQLite bridge) plus a MongoDB dump. See [Operations](OPERATIONS.md#backups).

---

*Last verified against `main`: 2026-09-10 (v2.16.5).*
