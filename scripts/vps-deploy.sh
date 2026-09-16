#!/usr/bin/env bash
# ── Rheoson VPS deploy / update ──────────────────────────────────────
#
# First run:  cp api/.env.vps.example api/.env && $EDITOR api/.env
#             edit Caddyfile → your domain
#             bash scripts/vps-deploy.sh
#
# Every later run is an in-place update: images rebuild, ./data survives.

set -euo pipefail

cd "$(dirname "$0")/.."

# ── Preflight ────────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  echo "✗ docker is not installed — see https://docs.docker.com/engine/install/"
  exit 1
fi

if [ ! -f api/.env ]; then
  echo "✗ api/.env is missing."
  echo "  cp api/.env.vps.example api/.env  — then fill in Clerk keys, SECRET_KEY, MONGODB_URL."
  exit 1
fi

if grep -q "^CLERK_SECRET_KEY=$" api/.env || grep -q "^SECRET_KEY=$" api/.env; then
  echo "✗ api/.env still has empty REQUIRED values (CLERK_SECRET_KEY / SECRET_KEY)."
  exit 1
fi
if grep -q "^CLERK_PUBLISHABLE_KEY=.\+" api/.env && [ -z "$VITE_CLERK_PUBLISHABLE_KEY" ]; then
  echo "⚠ VITE_CLERK_PUBLISHABLE_KEY is not set in the shell. The SPA will be"
  echo "  built WITHOUT Clerk sign-in. Export it before deploying:"
  echo "    export VITE_CLERK_PUBLISHABLE_KEY=pk_live_…"
fi

if grep -q "rheoson.example.com" Caddyfile; then
  echo "⚠ Caddyfile still contains the placeholder domain — edit it to your real domain."
  echo "  Continuing anyway; Let's Encrypt will fail until it is correct."
fi

# ── Data directory bootstrap ─────────────────────────────────────
# The API container runs as the non-root user 'shulker' (uid 1000 in the
# image). Bind mounts must be writable by that uid or downloads fail
# with EACCES on first write.
mkdir -p data/music data/downloads
if [ "$(id -u)" = "0" ]; then
  chown -R 1000:1000 data
else
  # Non-root hosts: current user is usually uid 1000 already (cloud
  # images create the first user as 1000). Verify and warn if not.
  if [ "$(stat -c %u data/music 2>/dev/null || echo '?')" != "1000" ]; then
    echo "⚠ ./data is not owned by uid 1000 (the container user)."
    echo "  Run: sudo chown -R 1000:1000 data"
  fi
fi

# ── Build + run ──────────────────────────────────────────────────
docker compose -f docker-compose.vps.yml build --pull
docker compose -f docker-compose.vps.yml up -d

# ── Post-deploy checks ───────────────────────────────────────────
echo "→ Waiting for the API to come healthy..."
for i in $(seq 1 30); do
  if docker compose -f docker-compose.vps.yml exec -T api \
      python -c "import urllib.request;urllib.request.urlopen('http://localhost:8000/api/health', timeout=3)" \
      >/dev/null 2>&1; then
    echo "✓ API healthy"
    docker compose -f docker-compose.vps.yml ps
    echo
    echo "Rheoson is up. First load: https://your-domain (see Caddyfile)."
    echo "Data lives in ./data/ — back it up and it will outlive every redeploy."
    exit 0
  fi
  sleep 2
done

echo "✗ API did not become healthy in 60s — logs:"
docker compose -f docker-compose.vps.yml logs --tail 50 api
exit 1
