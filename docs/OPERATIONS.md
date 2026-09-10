# Operations Runbook

> Companion pages: [Deployment](DEPLOYMENT.md) (initial setup), [Health & operations](DEPLOYMENT.md#health--operations) (probe overview). This page is the day-2 operating manual.

## Daily health checks

```bash
# Full snapshot — expect status ok, all services true (except intentionally absent ones)
curl -s https://<your-api>/api/health | python3 -m json.tool

# Deep probe (authenticated): DB latency, yt-dlp/ffmpeg versions, recent 5xx
curl -s -H "Authorization: Bearer <token>" https://<your-api>/api/health/diag
```

What to watch in `/api/health`:

| Field | Healthy | Investigate when |
|-------|---------|------------------|
| `services.mongodb` | `true` | `false` — recommendations/analytics degraded; check DB connectivity |
| `services.clerk` | `true` | `false` — auth will 401; secret key missing |
| `downloads.total` | bounded | climbing unboundedly — workers stuck; check `by_status.failed` |
| `memory.rss_mb` | stable | sustained growth — report with `/api/health/diag` |
| `keep_alive.total_failures` | ~0 | climbing — self-ping URL wrong (`RENDER_API_URL`) |

## Monitoring

- Liveness (`/health/live`) and readiness (`/health/ready`) are orchestrator-grade: wire your uptime checker to `/health/ready`.
- Logs are structlog JSON on stdout with `X-Request-ID` per request — ship stdout to any log pipeline.
- The metrics ring inside `/api/health/diag` exposes recent 5xx paths and latency percentiles without external tooling.

## Cron reference

All jobs are registered in `api/app/main.py` and listed (with next-run) in `/api/health`:

| Job | Cadence | Effect |
|-----|---------|--------|
| Keep-alive | ~14 min | Self-ping to prevent free-tier sleep (prod only) |
| Library scan | ~30 min | Refreshes track/stream indexes; sweeps stream buffers and failure cache |
| yt-dlp update | daily | Keeps extraction current against YouTube changes |
| Job cleanup | ~6 h | Trims download job history; bounds memory |

## Backups

Full system state = library directories + MongoDB:

```bash
# 1) Library + per-user stores + identity bridge
tar -czf rheoson-music-$(date +%F).tgz "$MUSIC_DIR"

# 2) Database (users, signals, analytics)
mongodump --uri="$MONGODB_URL" --archive > rheoson-db-$(date +%F).archive
```

The music directory contains everything file-backed (likes/history/playlists mirrors, download history, the SQLite track-identity bridge) — that tarball alone restores a working no-DB instance.

## Restore

1. Extract the library tarball to `MUSIC_DIR`.
2. `mongorestore --archive=rheoson-db-…archive` (optional — only account/recommendation data).
3. Start the API; verify `/api/health`, then spot-check playback of a downloaded track.

## Incident playbook

| Symptom | First checks | Likely fix |
|---------|--------------|------------|
| All requests 401 | `/api/health` → `services.clerk` | Restore `CLERK_SECRET_KEY`; check Clerk dashboard for outages |
| 502 on every stream | `/api/health/diag` yt-dlp/ffmpeg versions | Update yt-dlp (`yt-dlp -U` or rebuild image); confirm ffmpeg on PATH |
| Searches return nothing | ytmusicapi errors in logs | YouTube throttling — update yt-dlp; check egress IP reputation |
| Downloads stuck `downloading` | `/api/health` `downloads.by_status` | Cancel stuck jobs; check disk full / permission errors in logs |
| DB endpoints 503 | `services.mongodb` | Restart MongoDB / check `MONGODB_URL` — app otherwise fine |
| Cold starts ~50 s (Render) | `keep_alive` failures | Fix `RENDER_API_URL`; consider paid tier or disk-backed deploy |

## Upgrades

1. Read the [changelog](CHANGELOG.md) for breaking notes.
2. `git pull` the release tag; rebuild (pip/npm) and restart.
3. Bump-check: `/api/health` shows the new `version`.
4. yt-dlp updates itself daily; to pin it instead, constrain it in `api/pyproject.toml`.

## Secret rotation

Rotate independently, zero-downtime:

- `SECRET_KEY` — invalidates internal signatures; rotate during low traffic.
- `CLERK_SECRET_KEY` / `CLERK_PUBLISHABLE_KEY` — rotate in Clerk dashboard, update env, restart.
- `CLERK_WEBHOOK_SECRET` — add the new secret in Clerk (overlapping secrets supported), then remove the old one.

Never commit secrets; `.env` files are git-ignored (verify with `git check-ignore api/.env`).

---

*Last verified against `main`: 2026-09-10 (v2.16.5).*
