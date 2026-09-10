# Feature Status

One row per user-visible feature. Labels: **Implemented** (shipped, tested), **Partial** (works with known gaps), **Experimental** (usable, may change), **Planned** (not started or in progress), **Deprecated** (scheduled for removal).

| Feature | Status | Notes | Since |
|---------|--------|-------|-------|
| Search (text, filters, suggestions) | Implemented | ytmusicapi-backed; URL routing via netguard | v1.0 |
| Spotify link resolution (track/album/playlist/artist) | Implemented | Metadata only, requires credentials | v1.1 |
| Streaming with byte-range seek | Implemented | Session-backed remote fills | v1.3 |
| Offline playback of downloaded tracks | Implemented | Served from disk, zero network | v1.3 |
| Downloads (5 formats, quality, batch) | Implemented | Live progress over Socket.IO | v1.2 |
| Tagging (artwork + synced lyrics) | Implemented | mutagen | v1.2 |
| Synced LRC lyrics | Implemented | Multi-provider chain | v1.2 |
| Playlists CRUD + reorder + import/export | Implemented | Per-user, file-backed | v1.1 |
| Spotify playlist import | Implemented | Concurrent track matching | v1.1 |
| Smart playlists (most-played, recently-added, discover, time-capsule) | Implemented | Computed per request | v2.14 |
| Likes / play history (per user) | Implemented | Isolation covered by tests | v2.14 |
| Clerk authentication | Implemented | JWKS verification; fail-closed in prod | v2.15.1 |
| Per-user data isolation | Implemented | Likes/history/playlists | v2.14.19 |
| Clerk webhook user sync | Implemented | Svix-signed | v2.15 |
| Health system (live/ready/snapshot/diag) | Implemented | Background probe loop | v2.15.4 |
| Rate limiting (per-IP, per-route) | Implemented | Sliding window; Redis optional | v2.15.3 |
| SSRF guard (netguard) | Implemented | Allowlist + public-IP resolution | v2.15.3 |
| Recommendations (mixes, radio, autoplay) | Experimental | Requires MongoDB; heuristics under tuning | v2.16.2 |
| Taste onboarding (cold start) | Experimental | Max 3 artists | v2.16.4 |
| Wrapped / listening stats dashboards | Implemented | Year-in-review, streaks | v2.16.4 |
| Cross-device playback sync | Experimental | Socket.IO broadcast; conflict policy simple last-write | v2.16.3 |
| Discovery loop (hide/dislike feedback) | Experimental | Feedback shapes future mixes | v2.16.2 |
| Track identity bridge (videoId↔fileId) | Implemented | SQLite; survives rescans | v2.16.1 |
| PWA (installable, offline audio) | Partial | SW precache + range requests; background sync for audio pending | v1.3.2 |
| Android APK (Capacitor) | Implemented | Debug builds via CI; release signing manual | v2.15 |
| Android media controls (lock screen) | Implemented | Media Session API | v2.14 |
| Equalizer UI | Implemented | 10-band + presets | v2.15 |
| Sleep timer, crossfade, gapless | Implemented | Playback settings | v2.15 |
| Themes (7 accents, light/dark) | Implemented | Persisted pre-paint | v1.0 |
| Share cards (OG images) | Implemented | Public, validated | v2.14 |
| Visitor counter | Implemented | MongoDB-backed | v2.14 |
| Multi-user profile switching in-app | Planned | Identity switch via Clerk today | — |
| Federation (multi-server) | Planned | — | — |
| Background audio sync (PWA) | Planned | Depends on Workbox periodicsync adoption | — |
| Release-signed APK channel | Planned | Keystore required | — |
| Guest mode | Deprecated | Removed for security (v2.14.19); every endpoint requires a session | — |
| Legacy JWT auth (passlib/jose login) | Deprecated | Replaced by Clerk; register/login now proxy Clerk Backend API | v2.15.1 |

---

*Last verified against `main`: 2026-09-10 (v2.17.4).*
