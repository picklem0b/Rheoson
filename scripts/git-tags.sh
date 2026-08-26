#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Shulker — retrospective git tag script
#
# Run this from the repo root on the `main` branch.
# It adds all the semantic version tags that should have been created across
# the patch sessions. Tags are lightweight (no annotation body needed for
# patch versions; annotated for minor bumps).
#
# Usage:
#   chmod +x scripts/git-tags.sh
#   ./scripts/git-tags.sh
#   git push origin main --follow-tags
#
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'

log()  { echo -e "${CYAN}[tag]${NC} $*"; }
ok()   { echo -e "${GREEN}[ok]${NC}  $*"; }
err()  { echo -e "${RED}[err]${NC} $*"; }

# Guard: must be on main
BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "DETACHED")
if [[ "$BRANCH" != "main" ]]; then
  err "Must be on main branch (currently: $BRANCH)"
  exit 1
fi

# ── Helper: create tag if it doesn't already exist ────────────────────────────
tag() {
  local NAME="$1"
  local MSG="$2"
  if git tag -l "$NAME" | grep -q "^$NAME$"; then
    log "tag $NAME already exists — skipping"
  else
    git tag -a "$NAME" -m "$MSG"
    ok "tagged $NAME"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# TAG HISTORY
#
# These tags mark the commits that each patch session targeted.
# If you need them on a specific commit rather than HEAD, use:
#   git tag -a v1.x.y <commit-sha> -m "..."
# ─────────────────────────────────────────────────────────────────────────────

# v1.0.0 — Initial working release: FastAPI + React + Socket.IO
tag "v1.0.0" "chore: initial working release"

# v1.1.0 — Postgres migration, asyncpg, Docker multi-stage build
tag "v1.1.0" "feat: asyncpg + Docker multi-stage build"

# v1.2.0 — Capacitor Android APK, nginx, GitHub Actions CI
tag "v1.2.0" "feat: capacitor android APK + github actions CI"

# v1.3.0-rc — API branch working release (last session tag from memory)
tag "v1.3.0-rc" "chore: v1.3.0 release candidate (api branch)"

# v1.3.0 — Patch 1: single Howl, offline playback, like button fix,
#           stream cache, track index fix, download_service rewrite
tag "v1.3.0" "fix: offline playback, single Howl, download_service, track index"

# v1.3.1 — Patch 2: NowPlaying full rebuild, PlayerBar liked state fix,
#           playerStore savedProgress, usePlayer resume-after-reload
tag "v1.3.1" "feat: nowplaying rebuild, playerBar fix, resume after reload"

# v1.3.2 — Patch 3: PWA injectManifest, full sw.ts Workbox strategies,
#           RangeRequestsPlugin, background sync, vite.config chunks
tag "v1.3.2" "feat: PWA full service worker — offline audio, artwork, background sync"

# v1.3.3 — Patch 4: APScheduler cron jobs (library scan, yt-dlp update,
#           job cleanup), WebSocket listener dedup fix, README rewrite,
#           capacitor.config.ts full config
tag "v1.3.3" "feat: apscheduler cron jobs + ws dedup fix + readme rewrite"

# v1.3.4 — Patch 5: Search debounce fix (350ms), prewarm on all origins,
#           Library page redesign, Search.tsx full rewrite, toasts everywhere,
#           rhea.mp3 wired into success toasts and Toaster repositioned
tag "v1.3.4" "feat: search debounce, library redesign, toasts, rhea sound"

echo ""
ok "All tags applied."
echo ""
echo "Push them all with:"
echo "  git push origin main --follow-tags"
echo ""
echo "Or just the tags (no new commits):"
echo "  git push origin --tags"