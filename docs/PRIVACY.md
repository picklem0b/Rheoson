# Privacy Policy

**Rheoson** — Last updated: September 2026

## 1. What Rheoson is

Rheoson is free, open-source software (Apache-2.0) for self-hosted music streaming and downloading, maintained by LethaboK. It is not a commercial product. When you run your own instance, **you are the operator** — this policy describes what the software itself does, and what you should tell your own users if you host for others.

## 2. The short version

Rheoson does not collect, sell, or transmit your personal data to any central service operated by the maintainer. Everything you do — searches, playback, likes, playlists, downloads — lives on the server you configured and in your browser's storage.

## 3. Where data lives

| Data | Where | Notes |
|------|-------|-------|
| Account identity | Clerk (third-party identity provider) | Email, name, avatar you sign up with. Clerk's own privacy policy governs this data. |
| Session tokens | Browser memory (Clerk SDK) | Short-lived (~1 min); never persisted to disk by Rheoson |
| Likes, history, playlists | Your server (JSON files under the music directory; optionally MongoDB) | Keyed by your Clerk user ID; per-user isolated |
| Play history & signals | Your server (MongoDB, if configured) | Powers recommendations and analytics |
| Downloaded audio | Your server's library directory (and device storage in the Android app) | |
| Download job history | Your server (JSON) | |
| Theme, layout, settings | Browser localStorage / device | Never leaves the device |
| Search history | Device (IndexedDB/localStorage) | Clearable in-app |

## 4. Third-party services contacted when you use Rheoson

| Service | Why | Data sent |
|---------|-----|-----------|
| YouTube Music (via yt-dlp) | Search queries and audio streaming | Search terms, video IDs |
| Spotify Web API (optional) | Metadata when you paste a Spotify link | Link/track IDs — no audio, no personal data |
| Lyrics providers | Fetching lyrics for tracks you play | Track title/artist |
| Clerk | Authentication only | Sign-in credentials handled by Clerk's SDK/API |
| Image CDNs (via artwork proxy) | Cover art | Image URLs — proxied server-side, allowlisted |

None of these receive your likes, history, playlists, or any Rheoson-internal data.

## 5. Logging

The server logs structured events (request IDs, route, status, timing) for operation and debugging. Logs contain **no tokens, no credentials, no request bodies**, and database connection strings are redacted. Log retention and shipping are controlled by the operator.

## 6. Cookies & tracking

Rheoson sets no tracking or advertising cookies. Clerk may set functional session cookies as part of authentication (governed by Clerk). No analytics beacons exist in the app.

## 7. Children

Rheoson is general-audience software; the operator of an instance is responsible for compliance with local requirements (e.g. age rules) if hosting publicly.

## 8. Your control

- Delete your account → removes identity via Clerk; operator can purge server-side user data.
- Clear history → in-app (`DELETE /api/tracks/history` equivalent in Settings flows).
- Export playlists → built-in export endpoint.
- Self-host → run it yourself; then all data above is under your sole control.

## 9. Changes

Material changes to this policy ship with a release and are dated at the top. The authoritative copy lives in the repository.

---

*Last verified against `main`: 2026-09-10 (v2.16.5).*
