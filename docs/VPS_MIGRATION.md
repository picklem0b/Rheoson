# Migrating the cloud deployment from Render to a VPS

Render's free tier has an ephemeral disk: every redeploy wipes downloads,
likes, history, playlists, follows, and the track-identity sidecar. A VPS
with bind-mounted `./data/` removes that entire class of data loss, costs
about the same as nothing ($4–6/mo — Hetzner CX22, Contabo, Netcup, or an
Oracle free-tier ARM box), and gives yt-dlp a full CPU instead of a shared
throttled slice, which shows up directly in stream-warm and download speed.

## What you need

- Any 1 vCPU / 1–2 GB VPS with Ubuntu 22.04/24.04 (Debian fine too)
- A domain with an A record pointing at the VPS IP
- Ports 80 + 443 open (`ufw allow 80,443/tcp` — Caddy needs 80 for the
  ACME challenge)

## Steps

```bash
# 1. Install Docker (official convenience script is fine on a fresh box)
curl -fsSL https://get.docker.com | sh

# 2. Get the repo onto the server
git clone <your-repo-url> Rheoson && cd Rheoson

# 3. Configure
cp api/.env.vps.example api/.env
$EDITOR api/.env        # Clerk keys, SECRET_KEY, MONGODB_URL (Atlas M0 is fine)

# The SPA's Clerk publishable key is baked in at BUILD time (compose
# interpolates it from the shell). Export it before deploying, or the web
# image builds in local mode and sign-in is unavailable:
export VITE_CLERK_PUBLISHABLE_KEY=pk_live_…   # from dashboard.clerk.com
$EDITOR Caddyfile       # replace rheoson.example.com with your domain

# 4. Deploy (builds, starts, health-checks)
bash scripts/vps-deploy.sh
```

Your app is now on `https://your-domain` with automatic HTTPS. Re-run the
same script any time to update; `./data/` is never touched by a rebuild.

## Moving existing data off Render (if you had any)

Render's disk is ephemeral, so there is usually nothing to move except
MongoDB data — which already lives in Atlas and moves with you. If you
ran the pre-2.17.7 Render instance with real downloads, recover them from
a device via Settings → Privacy → Backup (export bundle JSON), then use
Restore on the VPS after signing in.

Termux ↔ VPS migration is the same story: Settings → Privacy → Backup on
the old host, Restore on the new one. Or copy `./data/` (VPS) /
`$MUSIC_DIR` (Termux) directly — the sidecars live next to the music.

## APK note

The APK keeps working against whichever origin it was built with. To point
new APK builds at the VPS, set `VITE_API_URL=https://your-domain` in
`web/.env.production` before `npm run build && npx cap sync`. The web UI
on the VPS is same-origin — no env var needed (that's the point of
`VITE_API_URL=""`).

## Operational notes

- **Backups**: `tar czf rheoson-$(date +%F).tgz data/` on any cron. That
  one file is the whole library + all user state.
- **Updates**: `git pull && bash scripts/vps-deploy.sh`.
- **Logs**: `docker compose -f docker-compose.vps.yml logs -f api`.
- **Rollback**: `git checkout <previous-tag> && bash scripts/vps-deploy.sh`.
  Data format migrations haven't shipped yet; sidecars are forward/backward
  compatible across v2.17.x.

## Why not keep Render *and* a VPS?

You can (render.yaml is untouched and still works as a roaming
streaming-only instance), but two instances means two libraries and
two histories — nothing syncs the file stores between them. MongoDB state
(accounts, preferences) is shared via Atlas, but likes/history/playlists/
follows are per-host JSON sidecars by design. Pick one host for real use;
keep Render only as a spare demo target.
