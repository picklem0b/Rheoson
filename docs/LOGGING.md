# Logging

Rheoson's console is meant to be **readable**: successes stay quiet, failures
stay loud, and you decide where the line sits — at boot or at runtime, without
a restart.

## Profiles

One environment variable picks a preset:

```bash
RHEOSON_LOG_PROFILE=default   # app events at INFO, "200 OK" flood dropped, warnings always shown
RHEOSON_LOG_PROFILE=quiet     # application-breaking errors only
RHEOSON_LOG_PROFILE=debug     # everything, everywhere — for tracing one flow end to end
```

| Profile | What you see |
| --- | --- |
| `default` | Every app event at INFO and up. Successful request lines (`GET … 200 OK`) are dropped; 4xx/5xx still print. Provider chatter (`syncedlyrics`) is held at WARNING. |
| `quiet` | Application-breaking errors only: ERROR and CRITICAL from every subsystem (boot/shutdown stay at WARNING so you can see the process die). |
| `debug` | The firehose. Everything at DEBUG, including the request flood. |

## Channels

Every log event belongs to a channel — the first segment of its event name
(`download.done` → `download`). Each channel has a *floor*: the minimum
severity it will print.

| Channel | Covers |
| --- | --- |
| `access` | Per-request lines (uvicorn) |
| `stream` | Relay, cache, buffer, artwork serving |
| `download` | Job lifecycle, yt-dlp progress |
| `library` | Scans, index builds, metadata writes |
| `lyrics` | Synced-lyrics providers (incl. the syncedlyrics lib) |
| `lifecycle` | Boot, shutdown, cron, health, websocket sessions |
| `core` | Auth, config, database — everything else app-side |

Driver libraries (`httpx`, `pymongo`, `motor`, `urllib3`, `asyncio`) are
always capped at WARNING — they emit an event per connection change and are
noise in a single-user app.

## Tuning without code

### Environment variables (highest priority)

```bash
# Pin the whole firehose to one subsystem while debugging a download:
RHEOSON_LOG_CHANNELS=stream=DEBUG,download=DEBUG

# A single subsystem louder or quieter than its profile:
RHEOSON_LOG_CHANNELS=lyrics=ERROR

# Override the root level (implies nothing else — explicit wins):
RHEOSON_LOG_LEVEL=DEBUG
```

A typo in any of these **fails startup loudly** rather than silently picking
defaults — the same fail-closed posture as `ENV`.

### Config file: `rheoson.logconfig.json`

Looked up in order: `MUSIC_DIR` → working directory → `api/`. First hit wins.
Touch the file and the running server picks it up within ~15 s — no restart.

```json
{
  "profile": "default",
  "channels": {
    "stream": "DEBUG",
    "lyrics": "ERROR"
  }
}
```

`profile` and `channels` combine: the profile sets every floor, then the
`channels` map overrides individual ones. A `level` key (`"DEBUG"`,
`"INFO"`, …) overrides the root level.

Any channel asking for DEBUG visibility implies a DEBUG root level, so
per-channel debug floors actually fire. `RHEOSON_LOG_LEVEL` beats this —
explicit input always wins.

Resolution order (last wins): **built-in defaults → config file → env vars**.

## The access gate

uvicorn prints one line per request — that was the `200 OK` flood. The gate
classifies by status, not level (uvicorn logs even 5xx at INFO):

| Profile | 2xx/3xx | 4xx/5xx |
| --- | --- | --- |
| `default` | dropped | shown |
| `quiet` | dropped | dropped |
| `debug` | shown | shown |

## One incident, one log line

When an upstream CDN dies mid-stream, the relay logs a single structured
warning — `stream.relay.upstream_died` with the track, bytes relayed, bytes
promised, and the error — and ends the response cleanly. The ASGI layer's
duplicate raw traceback is suppressed for that incident: the app logs the
diagnosis once, where it can be traced by request id. The same suppression
covers `api.unhandled_exception`, so a crash in dev prints one compact,
colored record instead of two giant tracebacks.

## Inspecting the live state

`GET /api/health/diag` (authenticated) includes a `logging` object: the
active profile, where the configuration came from (`builtin` / `file` /
`env`), the root level, and every channel's current floor.

## The debug workflow

1. Something misbehaves while you're using the app.
2. Drop a config file: `{"channels": {"stream": "DEBUG"}}` in `MUSIC_DIR`.
3. Reproduce. The relevant subsystem now shows every step.
4. Delete the file. Fifteen seconds later the console is quiet again.

No restart, no code change, no permanently noisy console.
