#!/usr/bin/env bash
# restructure.sh — Shulker v2.1.0 file rename + restructure
#
# Drop this file into the repo root and run:
#   bash restructure.sh
#
# What this does:
#   - Renames files to match LETHABO_STANDARDS naming conventions
#   - Never deletes anything — only git mv (tracked renames) or mv
#   - Fixes all internal imports to match the new file names
#   - Prints every action so you can review before committing
#
# After running:
#   git add -A
#   git commit -m "refactor: rename files to match LETHABO_STANDARDS conventions"
#   git tag v2.1.0 -m "v2.1.0 — file rename restructure"
#   git push origin dev --follow-tags

set -euo pipefail

# Always run relative to where the script lives (the repo root)
cd "$(dirname "${BASH_SOURCE[0]}")"

# ── Helpers ────────────────────────────────────────────────────

move() {
  local src="$1" dst="$2"
  if [ ! -e "$src" ]; then
    echo "  SKIP (not found): $src"
    return
  fi
  mkdir -p "$(dirname "$dst")"
  if git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
    git mv "$src" "$dst"
  else
    mv "$src" "$dst"
  fi
  echo "  MOVED: $src → $dst"
}

# Portable sed -i (GNU vs BSD)
sedi() {
  local expr="$1"; shift
  if sed --version 2>/dev/null | grep -q GNU; then
    sed -i "$expr" "$@"
  else
    sed -i '' "$expr" "$@"
  fi
}

echo ""
echo "═══════════════════════════════════════════════════"
echo " Shulker v2.1.0 — file restructure"
echo "═══════════════════════════════════════════════════"


# ──────────────────────────────────────────────────────────────
# BACKEND  api/
# ──────────────────────────────────────────────────────────────

echo ""
echo "── api/app/routers/ ──"
move "api/app/routers/stream.py"    "api/app/routers/stream_router.py"
move "api/app/routers/downloads.py" "api/app/routers/download_router.py"
move "api/app/routers/tracks.py"    "api/app/routers/track_router.py"
move "api/app/routers/search.py"    "api/app/routers/search_router.py"
move "api/app/routers/lyrics.py"    "api/app/routers/lyrics_router.py"
move "api/app/routers/playlists.py" "api/app/routers/playlist_router.py"
move "api/app/routers/settings.py"  "api/app/routers/settings_router.py"

echo ""
echo "── api/app/schemas/ ──"
move "api/app/schemas/download.py"  "api/app/schemas/download_schema.py"
move "api/app/schemas/lyrics.py"    "api/app/schemas/lyrics_schema.py"
move "api/app/schemas/playlist.py"  "api/app/schemas/playlist_schema.py"
move "api/app/schemas/search.py"    "api/app/schemas/search_schema.py"
move "api/app/schemas/track.py"     "api/app/schemas/track_schema.py"

echo ""
echo "── api/app/websocket/ ──"
move "api/app/websocket/manager.py" "api/app/websocket/ws_manager.py"
move "api/app/websocket/events.py"  "api/app/websocket/ws_events.py"

echo ""
echo "── api/app/core/ ──"
move "api/app/core/logging.py" "api/app/core/logging_config.py"


# ──────────────────────────────────────────────────────────────
# FRONTEND  web/src/
# ──────────────────────────────────────────────────────────────

echo ""
echo "── web/src/store/ ──"
move "web/src/store/downloadStore.ts" "web/src/store/download.store.ts"
move "web/src/store/playerStore.ts"   "web/src/store/player.store.ts"
move "web/src/store/queueStore.ts"    "web/src/store/queue.store.ts"
move "web/src/store/themeStore.ts"    "web/src/store/theme.store.ts"
move "web/src/store/uiStore.ts"       "web/src/store/ui.store.ts"

echo ""
echo "── web/src/hooks/ ──"
move "web/src/hooks/useAudioAnalyser.ts"      "web/src/hooks/audioAnalyser.hook.ts"
move "web/src/hooks/useDownloads.ts"          "web/src/hooks/downloads.hook.ts"
move "web/src/hooks/useKeyboardShortcuts.ts"  "web/src/hooks/keyboardShortcuts.hook.ts"
move "web/src/hooks/useLyrics.ts"             "web/src/hooks/lyrics.hook.ts"
move "web/src/hooks/useMediaSession.ts"       "web/src/hooks/mediaSession.hook.ts"
move "web/src/hooks/usePersisted.ts"          "web/src/hooks/persisted.hook.ts"
move "web/src/hooks/usePlayer.ts"             "web/src/hooks/player.hook.ts"
move "web/src/hooks/useQueue.ts"              "web/src/hooks/queue.hook.ts"
move "web/src/hooks/useSearch.ts"             "web/src/hooks/search.hook.ts"
move "web/src/hooks/useSpotifyCredentials.ts" "web/src/hooks/spotifyCredentials.hook.ts"

echo ""
echo "── web/src/types/ ──"
move "web/src/types/download.ts" "web/src/types/download.types.ts"
move "web/src/types/player.ts"   "web/src/types/player.types.ts"
move "web/src/types/playlist.ts" "web/src/types/playlist.types.ts"
move "web/src/types/search.ts"   "web/src/types/search.types.ts"
move "web/src/types/track.ts"    "web/src/types/track.types.ts"

echo ""
echo "── web/src/api/ ──"
move "web/src/api/client.ts"    "web/src/api/client.api.ts"
move "web/src/api/downloads.ts" "web/src/api/downloads.api.ts"
move "web/src/api/library.ts"   "web/src/api/library.api.ts"
move "web/src/api/lyrics.ts"    "web/src/api/lyrics.api.ts"
move "web/src/api/playlists.ts" "web/src/api/playlists.api.ts"
move "web/src/api/search.ts"    "web/src/api/search.api.ts"
move "web/src/api/tracks.ts"    "web/src/api/tracks.api.ts"

echo ""
echo "── web/src/lib/ ──"
move "web/src/lib/websocket.ts" "web/src/lib/websocket.lib.ts"


# ──────────────────────────────────────────────────────────────
# IMPORT FIXES — backend
# ──────────────────────────────────────────────────────────────

echo ""
echo "── Fixing backend imports ──"

# main.py — websocket + core module names
sedi 's/from app\.websocket\.manager import/from app.websocket.ws_manager import/g' "api/app/main.py"
sedi 's/from app\.websocket\.events import/from app.websocket.ws_events import/g'   "api/app/main.py"
sedi 's/from app\.core\.logging import/from app.core.logging_config import/g'       "api/app/main.py"
# main.py — router import aliases (individual lines inside the import block)
sedi 's/^    stream,$/    stream_router as stream,/'       "api/app/main.py"
sedi 's/^    downloads,$/    download_router as downloads,/' "api/app/main.py"
sedi 's/^    tracks,$/    track_router as tracks,/'         "api/app/main.py"
sedi 's/^    search,$/    search_router as search,/'         "api/app/main.py"
sedi 's/^    lyrics,$/    lyrics_router as lyrics,/'         "api/app/main.py"
sedi 's/^    playlists,$/    playlist_router as playlists,/' "api/app/main.py"
sedi 's/^    settings as settings_router,$/    settings_router,/' "api/app/main.py"
echo "  FIXED: api/app/main.py"

# routers/__init__.py (may be empty, but fix if it re-exports)
if [ -f "api/app/routers/__init__.py" ]; then
  sedi 's/from \.stream import/from .stream_router import/g'     "api/app/routers/__init__.py"
  sedi 's/from \.downloads import/from .download_router import/g' "api/app/routers/__init__.py"
  sedi 's/from \.tracks import/from .track_router import/g'       "api/app/routers/__init__.py"
  sedi 's/from \.search import/from .search_router import/g'       "api/app/routers/__init__.py"
  sedi 's/from \.lyrics import/from .lyrics_router import/g'       "api/app/routers/__init__.py"
  sedi 's/from \.playlists import/from .playlist_router import/g' "api/app/routers/__init__.py"
  sedi 's/from \.settings import/from .settings_router import/g'  "api/app/routers/__init__.py"
  echo "  FIXED: api/app/routers/__init__.py"
fi

# All router files — schema imports
for f in \
  "api/app/routers/download_router.py" \
  "api/app/routers/track_router.py" \
  "api/app/routers/search_router.py" \
  "api/app/routers/lyrics_router.py" \
  "api/app/routers/playlist_router.py" \
  "api/app/routers/stream_router.py" \
  "api/app/routers/settings_router.py"; do
  [ -f "$f" ] || continue
  sedi 's/from app\.schemas\.download import/from app.schemas.download_schema import/g' "$f"
  sedi 's/from app\.schemas\.track import/from app.schemas.track_schema import/g'       "$f"
  sedi 's/from app\.schemas\.search import/from app.schemas.search_schema import/g'     "$f"
  sedi 's/from app\.schemas\.lyrics import/from app.schemas.lyrics_schema import/g'     "$f"
  sedi 's/from app\.schemas\.playlist import/from app.schemas.playlist_schema import/g' "$f"
  echo "  FIXED imports: $f"
done

# Schema cross-imports
for f in \
  "api/app/schemas/playlist_schema.py" \
  "api/app/schemas/search_schema.py"; do
  [ -f "$f" ] || continue
  sedi 's/from app\.schemas\.track import/from app.schemas.track_schema import/g' "$f"
  echo "  FIXED imports: $f"
done

# Services — schema + websocket imports
for f in \
  "api/app/services/download_service.py" \
  "api/app/services/search_service.py" \
  "api/app/services/ytmusic_service.py" \
  "api/app/services/spotify_service.py" \
  "api/app/services/lyrics_service.py" \
  "api/app/services/metadata_service.py" \
  "api/app/services/artwork_service.py"; do
  [ -f "$f" ] || continue
  sedi 's/from app\.schemas\.download import/from app.schemas.download_schema import/g' "$f"
  sedi 's/from app\.schemas\.track import/from app.schemas.track_schema import/g'       "$f"
  sedi 's/from app\.schemas\.search import/from app.schemas.search_schema import/g'     "$f"
  sedi 's/from app\.schemas\.lyrics import/from app.schemas.lyrics_schema import/g'     "$f"
  sedi 's/from app\.schemas\.playlist import/from app.schemas.playlist_schema import/g' "$f"
  sedi 's/from app\.websocket\.manager import/from app.websocket.ws_manager import/g'   "$f"
  echo "  FIXED imports: $f"
done

# ws_events.py references ws_manager
if [ -f "api/app/websocket/ws_events.py" ]; then
  sedi 's/from app\.websocket\.manager import/from app.websocket.ws_manager import/g' "api/app/websocket/ws_events.py"
  echo "  FIXED imports: api/app/websocket/ws_events.py"
fi


# ──────────────────────────────────────────────────────────────
# IMPORT FIXES — frontend
# ──────────────────────────────────────────────────────────────

echo ""
echo "── Fixing frontend imports ──"

find web/src -type f \( -name "*.ts" -o -name "*.tsx" \) | while read -r f; do
  # stores
  sedi 's|@/store/downloadStore|@/store/download.store|g' "$f"
  sedi 's|@/store/playerStore|@/store/player.store|g'     "$f"
  sedi 's|@/store/queueStore|@/store/queue.store|g'       "$f"
  sedi 's|@/store/themeStore|@/store/theme.store|g'       "$f"
  sedi 's|@/store/uiStore|@/store/ui.store|g'             "$f"
  # hooks (alias paths)
  sedi 's|@/hooks/useAudioAnalyser|@/hooks/audioAnalyser.hook|g'         "$f"
  sedi 's|@/hooks/useDownloads|@/hooks/downloads.hook|g'                 "$f"
  sedi 's|@/hooks/useKeyboardShortcuts|@/hooks/keyboardShortcuts.hook|g' "$f"
  sedi 's|@/hooks/useLyrics|@/hooks/lyrics.hook|g'                       "$f"
  sedi 's|@/hooks/useMediaSession|@/hooks/mediaSession.hook|g'           "$f"
  sedi 's|@/hooks/usePersisted|@/hooks/persisted.hook|g'                 "$f"
  sedi 's|@/hooks/usePlayer|@/hooks/player.hook|g'                       "$f"
  sedi 's|@/hooks/useQueue|@/hooks/queue.hook|g'                         "$f"
  sedi 's|@/hooks/useSearch|@/hooks/search.hook|g'                       "$f"
  sedi 's|@/hooks/useSpotifyCredentials|@/hooks/spotifyCredentials.hook|g' "$f"
  # types
  sedi 's|@/types/download|@/types/download.types|g'   "$f"
  sedi 's|@/types/player|@/types/player.types|g'       "$f"
  sedi 's|@/types/playlist|@/types/playlist.types|g'   "$f"
  sedi 's|@/types/search|@/types/search.types|g'       "$f"
  sedi 's|@/types/track|@/types/track.types|g'         "$f"
  # api modules
  sedi 's|@/api/client|@/api/client.api|g'       "$f"
  sedi 's|@/api/downloads|@/api/downloads.api|g' "$f"
  sedi 's|@/api/library|@/api/library.api|g'     "$f"
  sedi 's|@/api/lyrics|@/api/lyrics.api|g'       "$f"
  sedi 's|@/api/playlists|@/api/playlists.api|g' "$f"
  sedi 's|@/api/search|@/api/search.api|g'       "$f"
  sedi 's|@/api/tracks|@/api/tracks.api|g'       "$f"
  # lib
  sedi 's|@/lib/websocket|@/lib/websocket.lib|g' "$f"
done

echo "  FIXED: all web/src imports"

# Fix relative cross-imports inside hooks (e.g. mediaSession.hook imports usePlayer)
find web/src/hooks -type f -name "*.hook.ts" | while read -r f; do
  sedi "s|from '\./usePlayer'|from './player.hook'|g"                     "$f"
  sedi "s|from '\./useQueue'|from './queue.hook'|g"                       "$f"
  sedi "s|from '\./useSearch'|from './search.hook'|g"                     "$f"
  sedi "s|from '\./useLyrics'|from './lyrics.hook'|g"                     "$f"
  sedi "s|from '\./useMediaSession'|from './mediaSession.hook'|g"         "$f"
  sedi "s|from '\./useDownloads'|from './downloads.hook'|g"               "$f"
  sedi "s|from '\./useAudioAnalyser'|from './audioAnalyser.hook'|g"       "$f"
  sedi "s|from '\./usePersisted'|from './persisted.hook'|g"               "$f"
  sedi "s|from '\./useSpotifyCredentials'|from './spotifyCredentials.hook'|g" "$f"
done

echo "  FIXED: relative hook cross-imports"

# App.tsx imports hooks by relative path too
for f in "web/src/App.tsx" "web/src/main.tsx"; do
  [ -f "$f" ] || continue
  sedi "s|from '@/hooks/useKeyboardShortcuts'|from '@/hooks/keyboardShortcuts.hook'|g" "$f"
  sedi "s|from '@/hooks/useMediaSession'|from '@/hooks/mediaSession.hook'|g"           "$f"
done


# ──────────────────────────────────────────────────────────────
# DONE
# ──────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════"
echo " Done. Next steps:"
echo ""
echo "   git add -A"
echo "   git commit -m \"refactor: rename files to match LETHABO_STANDARDS conventions\""
echo "   git tag v2.1.0 -m \"v2.1.0 — file rename restructure\""
echo "   git push origin dev --follow-tags"
echo "═══════════════════════════════════════════════════"
echo ""
