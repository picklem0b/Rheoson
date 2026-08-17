# 🎵 **SHULKER - Complete Project Context**

## **📊 Project Overview**

**Shulker** is a self-hosted, Spotify-grade music streaming platform that:

- Uses **YouTube Music** (via yt-dlp) as the audio source
- Optionally uses **Spotify API** for metadata (titles, artwork, durations)
- Supports **offline playback** from local files
- Features **real-time download progress** via WebSocket
- Built with **React 18 + TypeScript + Vite** (frontend) and **FastAPI + Python 3.13 + Socket.IO** (backend)

## **🏗️ Architecture**

```
FRONTEND (web/)                          BACKEND (api/)
─────────────────                       ─────────────────
React 18 + TypeScript + Vite              FastAPI + Python 3.13
Zustand (state management)               yt-dlp + ffmpeg
Howler.js (audio streaming)              ytmusicapi
Socket.IO-client (WebSocket)             Socket.IO (server)
Tailwind CSS + Framer Motion              APScheduler (cron jobs)
                                            mutagen (ID3 tags)
                                            structlog (logging)
```

## **🔄 Communication Flow**

- **HTTP REST API**: All endpoints prefixed with `/api`
- **WebSocket**: Socket.IO for real-time download progress
- **Streaming**: `/api/stream/{id}/audio` serves audio (local files or yt-dlp pipe)
- **Downloads**: Background jobs with WebSocket progress updates

---

# 🐛 **COMPLETE BUG LIST - Streaming & Backend-Frontend Communication**

## **🔴 CRITICAL BUGS (Production-Breaking)**

### **1. Stream Cache Invalidation Race Condition**

**Location**: `api/app/routers/stream.py:95-105`
**Severity**: **CRITICAL**
**Description**:
The `_ensure_cache()` function uses a global `_cache_built` flag with an async lock, but there's a race condition where multiple concurrent requests can see `_cache_built=False` and all attempt to rebuild the cache simultaneously. The comment on line 30-32 acknowledges this was a problem ("appearing 2-3 times in the logs"), but the fix is incomplete.

**Impact**:

- Multiple unnecessary cache rebuilds
- Performance degradation under concurrent load
- Potential memory issues with duplicate cache entries

**Evidence**:

```python
# Line 30-32: "stream.cache.built count=0" appearing 2-3 times in the logs
# The current lock doesn't prevent this completely
```

### **2. yt-dlp Process Leak in Streaming**

**Location**: `api/app/routers/stream.py:270-285`
**Severity**: **CRITICAL**
**Description**:
In `_serve_ytdlp()`, when a client disconnects or an error occurs, the yt-dlp subprocess is killed but there's no guarantee all resources are cleaned up. The `finally` block kills the process, but if the process was already killed by a previous error, it might not be properly waited on.

**Impact**:

- Zombie processes accumulating
- Memory leaks
- Potential port exhaustion

**Evidence**:

```python
finally:
    try:
        proc.kill()  # Might fail if already killed
    except Exception:
        pass
    await proc.wait()  # Might hang if process is stuck
```

### **3. No Range Request Support for yt-dlp Streams**

**Location**: `api/app/routers/stream.py:220-305`
**Severity**: **CRITICAL**
**Description**:
The `_serve_ytdlp()` function does NOT support HTTP Range requests (for seeking). It only handles range requests for local files in `_serve_local()`. This means:

- Users cannot seek in tracks being streamed from YouTube
- The progress bar works but seeking jumps back to the start
- Wastes bandwidth as the entire stream restarts

**Impact**:

- No seeking functionality for non-downloaded tracks
- Poor user experience
- Bandwidth waste

**Evidence**:

```python
# _serve_ytdlp returns StreamingResponse without range support
# Only _serve_local has range request handling (lines 150-175)
```

### **4. WebSocket Connection Not Verified Before Use**

**Location**: `api/app/websocket/manager.py:25-30`
**Severity**: **HIGH**
**Description**:
The `emit()` method in `ConnectionManager` silently fails if `_sio` is None (not initialized). There's no check to ensure the Socket.IO server is ready before emitting events.

**Impact**:

- Download progress events lost if WebSocket not connected
- No error feedback to frontend
- Silent failures

**Evidence**:

```python
async def emit(self, event: str, data: dict, room: str | None = None) -> None:
    if self._sio is None:
        log.warning("ws.emit.no_server", event=event)  # Just logs, doesn't retry
        return
```

### **5. Download Job Cleanup Doesn't Handle Running Tasks**

**Location**: `api/app/services/download_service.py:340-350`
**Severity**: **HIGH**
**Description**:
The `cancel_job()` function cancels the task but doesn't properly clean up the `_tasks` dictionary if the task is still running. The `retry_job()` function creates a new job with the same ID but doesn't ensure the old task is fully stopped.

**Impact**:

- Multiple tasks with same job ID can run concurrently
- Resource waste
- Inconsistent job state

**Evidence**:

```python
async def cancel_job(job_id: str) -> bool:
    if job_id not in _jobs:
        return False
    task = _tasks.pop(job_id, None)  # Removes from _tasks
    if task and not task.done():
        task.cancel()
        try:
            await asyncio.wait_for(asyncio.shield(task), timeout=2.0)
        except (asyncio.CancelledError, asyncio.TimeoutError):
            pass
    _update(job_id, status='error', error='Cancelled by user')
    return True
```

### **6. Stream URL Hardcoded in Track Responses**

**Location**: Multiple files
**Severity**: **HIGH**
**Description**:
Track objects from various sources (ytmusic, spotify, local) all hardcode the stream URL as `/api/stream/{id}/audio`. This assumes the backend is always at the same host as the frontend, which breaks in production deployments where frontend and backend might be on different domains.

**Impact**:

- Streaming fails in production (Render, etc.)
- CORS issues
- Broken offline playback

**Evidence**:

```python
# In ytmusic_service.py line 84:
"streamUrl": f"/api/stream/{vid}/audio" if vid else None,

# In search_service.py line 189:
"streamUrl": f"/api/stream/{vid}/audio",

# In tracks.py (frontend) line 46:
getStreamUrl: (id: string) => `${API_BASE}/stream/${id}/audio`,
```

### **7. No Error Recovery for Failed yt-dlp Streams**

**Location**: `api/app/routers/stream.py:220-305`
**Severity**: **HIGH**
**Description**:
When all yt-dlp attempts fail (line 299-305), the function raises an HTTPException with status 502. However, there's no mechanism to:

- Retry with different parameters
- Fall back to alternative sources
- Cache the failure to avoid repeated attempts

**Impact**:

- Users get generic "try again later" messages
- No intelligent fallback
- Repeated failures for the same track

**Evidence**:

```python
raise HTTPException(
    status_code=502,
    detail="Could not stream this track. YouTube may be rate-limiting..."
)
```

## **🟡 MEDIUM SEVERITY BUGS**

### **8. WebSocket Listener Duplication (FIXED but needs verification)**

**Location**: `web/src/lib/websocket.ts:54-70`
**Severity**: **MEDIUM**
**Description**:
The comment indicates this was previously a bug where listeners were pushed into an array with no deduplication. The fix uses a `Map<event, Set<handler>>` pattern. However, the handler comparison uses object reference equality, which might not work correctly if handlers are recreated on each render.

**Impact**:

- Potential duplicate event firing
- Memory leaks from accumulated handlers

**Evidence**:

```typescript
// Line 54-56: FIX: previously listeners were pushed into an array with no deduplication
// The registry is: Map<event, Set<handler>>
```

### **9. Download Progress Stuck at 82%**

**Location**: `api/app/services/download_service.py:125-135`
**Severity**: **MEDIUM**
**Description**:
The progress reporting has hardcoded values:

- Downloading: 0-80%
- Converting: 82%
- Tagging: 90%
- Done: 100%

The "converting" and "tagging" phases jump directly to fixed percentages rather than calculating actual progress.

**Impact**:

- Progress bar appears to stall
- Poor user experience
- Inaccurate progress reporting

**Evidence**:

```python
_update(job_id, status='converting', progress=82.0)
# ...
_update(job_id, status='tagging', progress=90.0)
```

### **10. No Content-Length for yt-dlp Streams**

**Location**: `api/app/routers/stream.py:290-298`
**Severity**: **MEDIUM**
**Description**:
The `_serve_ytdlp()` StreamingResponse doesn't include a Content-Length header because yt-dlp streams are of unknown length. This prevents:

- Accurate progress calculation in the frontend
- Proper buffering in some browsers
- Seek functionality

**Impact**:

- Howler.js can't determine duration accurately
- Progress bar may be inaccurate
- Some browsers may buffer poorly

**Evidence**:

```python
return StreamingResponse(
    _pipe(),
    media_type="audio/mpeg",
    headers={
        "Accept-Ranges":          "bytes",  # But no range support!
        "Cache-Control":          "no-cache",
        "X-Content-Type-Options": "nosniff",
    },
)
```

### **11. Track Index Not Invalidated on Manual File Changes**

**Location**: `api/app/routers/tracks.py:25-45`
**Severity**: **MEDIUM**
**Description**:
The `_build_index()` function scans MUSIC_DIR and caches results in `_track_index`. However, if users manually add/remove files to MUSIC_DIR, the index isn't invalidated until:

- A download completes (calls `invalidate_track_index()`)
- The cron job runs (every 30 minutes)

**Impact**:

- New manually-added files don't appear immediately
- Deleted files still show in library
- Inconsistent state

**Evidence**:

```python
# Line 33-45: _build_index caches results but has no filesystem watch
# Only invalidated by downloads or cron
```

### **12. No Error Handling for Stale Local Cache Entries**

**Location**: `api/app/routers/stream.py:75-85`
**Severity**: **MEDIUM**
**Description**:
The `_find_local()` function checks if a cached path exists, but if the file was deleted, it only removes that one entry. There's no mechanism to scan and remove all stale entries periodically.

**Impact**:

- Cache grows with stale entries
- Memory waste
- Potential performance degradation

**Evidence**:

```python
def _find_local(track_id: str) -> Optional[Path]:
    if track_id in _local_cache:
        p = _local_cache[track_id]
        if p.exists():
            return p
        # Stale entry — file was deleted
        del _local_cache[track_id]  # Only removes one at a time
    return None
```

### **13. WebSocket Reconnection Doesn't Re-subscribe to Events**

**Location**: `web/src/hooks/useDownloads.ts:40-65`
**Severity**: **MEDIUM**
**Description**:
The `useDownloads` hook sets up WebSocket event listeners in a `useEffect`. If the WebSocket disconnects and reconnects, the listeners are not automatically re-subscribed because the effect doesn't have a dependency on the connection state.

**Impact**:

- Download progress stops updating after reconnection
- Users need to refresh the page
- Silent failure

**Evidence**:

```typescript
useEffect(() => {
	ws.connect();
	// Listeners set up here
	ws.on('download:progress', onProgress);
	// ...
	return () => {
		ws.off('download:progress', onProgress);
		// ...
	};
}, [updateJob]); // No dependency on ws.connected
```

### **14. Stream Cache Not Invalidated on File Deletion**

**Location**: `api/app/routers/stream.py:70-75`
**Severity**: **MEDIUM**
**Description**:
The `invalidate_stream_cache()` function only sets `_cache_built = False`, but it doesn't remove stale entries from `_local_cache`. This means deleted files can still appear in the cache until the next full rebuild.

**Impact**:

- Attempts to stream deleted files may fail
- Inconsistent cache state
- Wasted lookups

**Evidence**:

```python
def invalidate_stream_cache() -> None:
    global _cache_built
    _cache_built = False
    log.debug("stream.cache.invalidated")
    # Doesn't clear _local_cache
```

### **15. No Timeout for yt-dlp Stream Spawn**

**Location**: `api/app/routers/stream.py:230-245`
**Severity**: **MEDIUM**
**Description**:
When spawning yt-dlp for streaming, there's no timeout on the `create_subprocess_exec()` call. If yt-dlp hangs during startup, the request will hang indefinitely.

**Impact**:

- Requests can hang forever
- No feedback to user
- Resource waste

**Evidence**:

```python
proc = await asyncio.create_subprocess_exec(
    *cmd,
    stdout=asyncio.subprocess.PIPE,
    stderr=asyncio.subprocess.PIPE,
)
# No timeout!
```

### **16. Download Job Status Inconsistency**

**Location**: `api/app/services/download_service.py:320-360`
**Severity**: **MEDIUM**
**Description**:
The `_download_task()` function updates job status through various states (downloading, converting, tagging, done, error), but there's no guarantee these updates are atomic or consistent. If an error occurs during tagging, the job might be left in an intermediate state.

**Impact**:

- Job status can be inconsistent
- Frontend shows confusing states
- Retry may not work correctly

**Evidence**:

```python
try:
    # ... download and tag
    _update(job_id, status='done', progress=100.0, filePath=str(file_path))
    await ws_manager.emit_download_done(job_id, str(file_path))
except asyncio.CancelledError:
    _update(job_id, status='error', error='Cancelled')
    await ws_manager.emit_download_error(job_id, 'Cancelled')
except Exception as e:
    # ... error handling
```

## **🟢 LOW SEVERITY BUGS & IMPROVEMENTS**

### **17. Hardcoded Audio Format in Stream**

**Location**: `api/app/routers/stream.py:225-230`
**Severity**: **LOW**
**Description**:
The yt-dlp command for streaming hardcodes `-x --audio-format mp3 --audio-quality 192K`. There's no way to configure this or match the user's download preferences.

**Impact**:

- Always streams at 192K mp3
- No flexibility for quality preferences
- Wastes bandwidth if user prefers lower quality

**Evidence**:

```python
base_cmd = [
    "yt-dlp",
    "--quiet", "--no-warnings", "--no-playlist",
    "-x", "--audio-format", "mp3", "--audio-quality", "192K",
    "-o", "-",
]
```

### **18. No User-Agent Rotation for ytmusicapi**

**Location**: `api/app/services/ytmusic_service.py:15-40`
**Severity**: **LOW**
**Description**:
The YTMusic singleton doesn't rotate user agents or handle rate limiting. If YouTube blocks the current user agent, all ytmusicapi calls will fail.

**Impact**:

- Potential rate limiting
- No fallback mechanisms
- Single point of failure

**Evidence**:

```python
_ytm = await loop.run_in_executor(None, YTMusic)
# No user agent configuration
```

### **19. WebSocket Ping/Pong Not Implemented**

**Location**: `api/app/websocket/events.py:1-20`
**Severity**: **LOW**
**Description**:
The WebSocket events only handle connect/disconnect and a basic ping/pong. There's no keepalive mechanism to detect dead connections.

**Impact**:

- Connections may appear alive when dead
- No automatic reconnection detection
- Stale connections waste resources

**Evidence**:

```python
@sio.event
async def ping(sid, data):
    await sio.emit("pong", {"sid": sid}, room=sid)
# No keepalive timer
```

### **20. No CORS Configuration for WebSocket**

**Location**: `api/app/main.py:145-150`
**Severity**: **LOW**
**Description**:
The Socket.IO server is created with CORS settings, but there's no explicit CORS configuration for the WebSocket path. This might cause issues in some browser configurations.

**Impact**:

- Potential WebSocket connection failures
- CORS errors in some environments
- Inconsistent behavior

**Evidence**:

```python
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=_ALLOWED_ORIGINS,  # This might not be enough
    logger=False,
    engineio_logger=False,
)
```

### **21. Download Progress Not Persisted Across Server Restarts**

**Location**: `api/app/services/download_service.py:20-25`
**Severity**: **LOW**
**Description**:
Download jobs are stored in-memory only (`_jobs: dict[str, dict]`). If the server restarts, all job state is lost.

**Impact**:

- Active downloads appear as failed after restart
- Progress lost
- User confusion

**Evidence**:

```python
# In-memory only — jobs do not survive a server restart.
_jobs:  dict[str, dict]          = {}
_tasks: dict[str, asyncio.Task]  = {}
```

### **22. No Validation of MUSIC_DIR Existence**

**Location**: `api/app/routers/stream.py:40-50`
**Severity**: **LOW**
**Description**:
The `_build_cache_sync()` function iterates over `settings.all_music_dirs` but doesn't validate that these directories exist or are accessible before scanning.

**Impact**:

- Errors during cache build
- Silent failures
- No user feedback

**Evidence**:

```python
def _build_cache_sync() -> None:
    global _cache_built
    _local_cache.clear()
    for d in settings.all_music_dirs:
        base = Path(d)
        if not base.exists():  # Only checks here
            continue
```

### **23. Hardcoded Chunk Size in Stream**

**Location**: `api/app/routers/stream.py:17`
**Severity**: **LOW**
**Description**:
The chunk size for streaming is hardcoded to 64KB (`CHUNK = 65_536`). This might not be optimal for all network conditions.

**Impact**:

- Suboptimal performance
- No adaptability
- Potential buffering issues

**Evidence**:

```python
CHUNK = 65_536  # 64 KB - hardcoded
```

### **24. No Error Handling for Howler.js in Frontend**

**Location**: `web/src/hooks/usePlayer.ts:150-160`
**Severity**: **LOW**
**Description**:
The `onplayerror` handler in usePlayer only handles suspended AudioContext. Other Howler.js errors (network errors, decode errors) are logged but not handled.

**Impact**:

- Playback failures not communicated to user
- No retry mechanism
- Poor error feedback

**Evidence**:

```typescript
onplayerror(_id, err) {
    console.error('[Shulker] play error', err);
    // Resume a suspended AudioContext (required after user-gesture lock on Android)
    if (Howler.ctx?.state === 'suspended') {
        Howler.ctx
            .resume()
            .then(() => _howl?.play())
            .catch(() => {});
    }
    // No other error handling!
}
```

### **25. No Cleanup of Aborted Howl Instances**

**Location**: `web/src/hooks/usePlayer.ts:60-70`
**Severity**: **LOW**
**Description**:
The `_destroy()` function stops and unloads the Howl instance, but if a new track is loaded while the previous one is still loading, there might be race conditions where multiple Howl instances briefly exist.

**Impact**:

- Potential memory leaks
- Multiple audio streams briefly
- Resource waste

**Evidence**:

```typescript
function _destroy() {
	_stopTimer();
	if (_howl) {
		_howl.off();
		_howl.stop();
		_howl.unload();
		_howl = null;
	}
	_loadedId = null;
}
```

---

## Bug Summary by Category

**Streaming — 12 bugs**

| #   | Severity | Bug                                             |
| --- | -------- | ----------------------------------------------- |
| 1   | Critical | Stream cache invalidation race condition        |
| 2   | Critical | yt-dlp process leak                             |
| 3   | Critical | No range request support for yt-dlp streams     |
| 4   | High     | Stream URL hardcoded as relative path           |
| 7   | High     | No error recovery for failed yt-dlp streams     |
| 10  | Medium   | No Content-Length for yt-dlp streams            |
| 15  | Medium   | No spawn timeout for yt-dlp                     |
| 17  | Low      | Hardcoded mp3/192K format in stream             |
| 22  | Low      | Cache scan vulnerable to mid-scan mount removal |
| 23  | Low      | Chunk size hardcoded                            |
| 24  | Low      | Howler.js `onplayerror` silent on most errors   |
| 25  | Low      | `_destroy()` mid-load race condition            |

**WebSocket / Real-time — 5 bugs**

| #   | Severity | Bug                                                 |
| --- | -------- | --------------------------------------------------- |
| 5   | High     | emit() silently drops events when `_sio` is None    |
| 8   | Medium   | Listener deduplication fragile with non-stable refs |
| 13  | Medium   | Reconnection re-subscription needs verification     |
| 19  | Low      | No keepalive/heartbeat                              |
| 20  | Low      | CORS dual-middleware potential conflict             |

**Downloads — 5 bugs**

| #   | Severity | Bug                                                   |
| --- | -------- | ----------------------------------------------------- |
| 6   | High     | cancel_job doesn't guarantee termination before retry |
| 9   | Medium   | Progress jumps at fixed percentages                   |
| 16  | Medium   | Job can be left in intermediate status permanently    |
| 21  | Low      | Jobs lost on server restart                           |
| 18  | Low      | YTMusic singleton has no rate-limit recovery          |

**Cache / State — 4 bugs**

| #   | Severity | Bug                                                      |
| --- | -------- | -------------------------------------------------------- |
| 11  | Medium   | Track index not invalidated on manual file changes       |
| 12  | Medium   | Stale entries accumulate in `_local_cache`               |
| 14  | Medium   | `invalidate_stream_cache()` doesn't clear `_local_cache` |
| 19  | Low      | Keepalive absence leads to stale WS session table        |

---

## Fix Priority

**P0 — fix before next production deploy**

- Bug 3: Add range request support to `_serve_ytdlp()` — seeking is broken for all streamed tracks
- Bug 2: Fix yt-dlp process leak — `proc.wait()` with timeout, kill on timeout
- Bug 1: Strengthen stream cache lock — clear `_local_cache` inside lock before rebuild
- Bug 6: Ensure task termination before retry — await full cancellation with fallback kill

**P1 — fix soon**

- Bug 5: Queue or raise on emit when `_sio` is None
- Bug 7: Add failure cache for 502 track IDs (TTL ~60s) to prevent retry storms
- Bug 4: Audit all server-side uses of `streamUrl` — relative path is a latent bug
- Bug 15: Add spawn timeout to yt-dlp subprocess

**P2 — quality improvements**

- Bug 9: Estimate converting/tagging duration from file size and emit intermediate progress
- Bug 11: Add an `invalidate_on_file_change` mechanism or reduce cron interval
- Bug 13: Verify WS re-subscription survives aggressive disconnect/reconnect
- Bug 14: Call `_local_cache.clear()` inside `invalidate_stream_cache()`

**P3 — future / V2**

- Bug 21: Persist `_jobs` to SQLite (part of the V2 stable ID work)
- Bug 17: Respect user format/quality settings in `_serve_ytdlp()`
- Bug 18: Add UA rotation and recoverable error handling in `ytmusic_service`
- Bug 19: Implement server-side heartbeat (Socket.IO built-in ping interval config)
- Bug 24: Add user-facing toast on `onplayerror` with retry button
- Bug 23: Make chunk size configurable via `config.py`

---

## Testing Checklist

**Streaming**

```bash
# Range request on local file — should return 206
curl -I -H "Range: bytes=0-1023" http://localhost:8000/api/stream/{local_track_id}/audio

# Range request on yt-dlp stream — currently returns 200 (seeking will fail)
curl -I -H "Range: bytes=0-1023" http://localhost:8000/api/stream/{youtube_id}/audio

# Concurrent stream requests — watch logs for duplicate "stream.cache.built" lines
ab -n 10 -c 5 http://localhost:8000/api/stream/{track_id}/audio
```

**WebSocket**

- Open DevTools Network → WS tab, confirm single connection on app load
- Disable network mid-download, re-enable — verify progress events resume without page refresh
- Open two tabs — verify download events appear in both without duplication

**Downloads**

- Start 6 simultaneous downloads — verify only 4 run concurrently (semaphore)
- Cancel a download mid-progress, immediately retry — verify no duplicate tasks in logs
- Kill the server mid-download, restart — verify files on disk, jobs gone from UI (expected)

---

## Code Quality Notes

**Strengths worth preserving**

- Single Howl instance — prevents double-playing bugs
- structlog throughout — consistent, structured logging
- asyncio/executor pattern — blocking calls never block the event loop
- `Map<event, Set<handler>>` WebSocket registry — deduplication on re-renders
- Double-checked locking in `_ensure_cache` — correct pattern, incomplete execution

**Areas to address in V2**

- Bare `except Exception` in several service methods — no specific handling
- No test suite — no unit or integration tests visible in the repo
- Hardcoded configuration values scattered across files — should move to `config.py`
- No SQLite yet — needed for stable track IDs and job persistence
- Resource cleanup — process and memory cleanup needs improvement in stream and download paths
