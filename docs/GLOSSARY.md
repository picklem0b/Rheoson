# Glossary

Every Rheoson document uses these terms with exactly these meanings. PRs that introduce new concepts add them here (see the [docs-in-PR rule](README.md#maintenance-rules)).

## Core concepts

| Term | Definition |
|------|------------|
| **Track** | A playable song. Identified by a YouTube video ID (11 chars) when remote, or a file ID when local. |
| **Library** | The audio files on the server under the configured music directories, plus their metadata index. |
| **Local track** | A track backed by a file in the library. Plays from disk with zero network. |
| **Remote track** | A track not on disk; resolved and streamed from YouTube Music on demand. |
| **File ID** | Stable identifier derived from file metadata (`metadata_service._file_id`) used to keep library identity stable across rescans. |
| **Track identity bridge** | SQLite mapping (`track_identity`) between video IDs and file IDs so a downloaded track keeps its play counts, likes, and history. |

## Streaming

| Term | Definition |
|------|------------|
| **Fill session** | One background yt-dlp process writing a track's full audio to a buffer file; all concurrent listeners stream from that file. Bounded per instance. |
| **Buffer file** | The temp file a fill session writes. Promoted to the remote cache when complete; deleted on failure. |
| **Remote cache** | TTL-bounded store of completed buffer files served with full byte-range support. |
| **Byte-range serving** | HTTP `Range` support (206 responses) enabling seek without re-downloading. |
| **Failure cache** | Short-lived per-track record of upstream failures preventing retry storms. |
| **Warm-up** | Pre-starting a fill session before playback so first bytes arrive sooner. |

## Downloads

| Term | Definition |
|------|------------|
| **Download job** | A queued/running/completed/failed unit of work with its recorded options (format, quality, embed flags). |
| **Staging directory** | Per-job scratch dir holding the raw download until it is converted, tagged, and moved into the library. |
| **Tagging** | Writing metadata (title, artist, album, artwork, synced lyrics) into the audio file with mutagen. |
| **Sanitization** | Stripping filesystem-illegal characters from names; duplicates get ` (n)` counters. |
| **Path containment** | Guarantee that downloads and custom paths resolve inside configured music directories. |

## Identity & security

| Term | Definition |
|------|------------|
| **Clerk** | The identity provider. Issues the session JWTs the API verifies. |
| **Session JWT** | Short-lived RS256 token from Clerk, verified against Clerk's JWKS. |
| **User sub** | The Clerk user ID (`sub` claim) — the canonical per-user key across all stores. |
| **Per-user isolation** | Property that likes, history, and playlists are keyed by sub and never visible cross-user. |
| **Svix signature** | HMAC-SHA256 webhook signature scheme used by Clerk; required on every webhook call. |
| **Netguard** | The SSRF guard applied to every server-side fetch: scheme checks, media-host allowlist, public-IP resolution. |
| **Media-host allowlist** | Domains the server will fetch media metadata/audio from. |
| **Artwork allowlist** | Separate, stricter host list for the image proxy. |

## Data

| Term | Definition |
|------|------------|
| **File-backed store** | JSON state in the music directory (likes, history, playlists mirrors) that works without MongoDB. |
| **MongoDB (Motor)** | Async database for users, recommendation signals, analytics. Optional; endpoints degrade to 503 without it. |
| **Signal** | A recorded user action (play, like, dislike, skip) feeding the recommendation engine. |
| **Taste profile** | Aggregated user preferences powering mixes, radio, and discovery. |
| **Cold start** | A user with no taste profile yet; triggers artist onboarding. |

## Frontend

| Term | Definition |
|------|------------|
| **Howl** | The single Howler.js audio instance — guarantees one active audio source. |
| **Offline queue** | IndexedDB-backed store of mutations made while offline, replayed on reconnect. |
| **Service worker (SW)** | Workbox-based PWA worker providing offline audio, artwork caching, and range requests. |
| **Capacitor** | Native Android shell around the web build; provides plugins (filesystem, network, splash). |
| **CapacitorHttp** | Native HTTP client replacing `fetch` inside the APK WebView, bypassing WebView CORS. |

## Operations

| Term | Definition |
|------|------------|
| **Liveness / readiness** | `health/live` (process up, zero I/O) vs `health/ready` (can serve). |
| **Keep-alive pinger** | Cron that self-pings `/api/health` to prevent free-tier sleep. |
| **Library scan** | Cron invalidating caches so manually added files appear without restart. |
| **Health snapshot** | `/api/health` payload: version, uptime, subsystem flags, cron schedule. |

---

*Last verified against `main`: 2026-09-10 (v2.16.5).*
