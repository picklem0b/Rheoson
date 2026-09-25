#!/data/data/com.termux/files/usr/bin/bash
# Start the Rheoson API on this device (Termux).
#
# Usage: ~/Rheoson/scripts/start-api.sh [--foreground]
#
# Idempotent: if the API already answers on 127.0.0.1:8000 this exits 0
# without starting a second instance. Logs land in ~/rheoson-api.log.
#
# The APK's local mode points at this process. Termux processes die on
# reboot, and a dead backend reads to the app as "it doesn't play music
# anymore" — which is why this script exists and why Termux:Boot calls it.

set -u

PORT=8000
API_DIR="$HOME/Rheoson/api"
LOG="$HOME/rheoson-api.log"
PIDFILE="$HOME/.rheoson-api.pid"

healthy() {
   curl -s -o /dev/null --max-time 5 "http://127.0.0.1:$PORT/api/health"
}

if healthy; then
   echo "[rheoson] API already running on :$PORT"
   exit 0
fi

# Stale process from a previous session that never came up — clean it.
if [ -f "$PIDFILE" ]; then
   oldpid="$(cat "$PIDFILE" 2>/dev/null || true)"
   if [ -n "$oldpid" ] && kill -0 "$oldpid" 2>/dev/null; then
      kill "$oldpid" 2>/dev/null || true
      sleep 2
   fi
   rm -f "$PIDFILE"
fi

cd "$API_DIR" || { echo "[rheoson] missing $API_DIR" >&2; exit 1; }

MUSIC_DIR="$HOME/Rheoson/music" \
DOWNLOADS_DIR="$HOME/Rheoson/downloads" \
UV_NO_PROGRESS=1 \
uv run uvicorn app.main:socket_app \
   --host 127.0.0.1 --port "$PORT" \
   >> "$LOG" 2>&1 &
echo $! > "$PIDFILE"

if [ "${1:-}" = "--foreground" ]; then
   echo "[rheoson] started (pid $(cat "$PIDFILE")); log: $LOG"
   echo "[rheoson] Ctrl-C stops the API"
   wait "$(cat "$PIDFILE")"
   exit 0
fi

# Wait for boot (up to 45 s), then report without assuming success.
for _ in $(seq 1 15); do
   if healthy; then
      echo "[rheoson] API up on :$PORT (pid $(cat "$PIDFILE"))"
      exit 0
   fi
   sleep 3
done

echo "[rheoson] API did not become healthy — check $LOG" >&2
exit 1
