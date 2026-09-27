# Rheoson Engine (Python)

The muscles only Python has: **yt-dlp**, **ffmpeg**, and audio tagging. Nothing
else lives here — accounts, playlists and messaging belong to `apps/server`.

## Endpoints

| Route | Purpose |
| --- | --- |
| `GET /health` | What this host can do: tool paths, versions, error-registry source |
| `GET /resolve/{track_id}` | A playable CDN URL for the relay (`url`, `contentType`, `expiresAt`) |
| `GET /probe/{track_id}` | Real content type and byte length, reading no media bytes |

Downloads, the job queue and tagging arrive in a later milestone. The resolve
path is carved first because it is what makes "press play, hear sound" work.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `ENGINE_PORT` | `8081` | HTTP listen port |
| `ENGINE_HOST` | `0.0.0.0` | Bind address |
| `ENGINE_TOKEN` | *(empty)* | Shared service token; empty trusts the network |
| `ENGINE_DATA_DIR` | `/data` | Downloads, staging and tagging work |
| `ENGINE_RESOLVE_TIMEOUT` | `25` | Seconds allowed for one `yt-dlp -g` |
| `ENGINE_DIRECT_URL_TTL` | `14400` | Resolved-URL cache lifetime (CDN signatures last ~6 h) |
| `ENGINE_CLIENT_LADDER` | built-in | Comma-separated player-client order |
| `YTDLP_BIN` / `FFMPEG_BIN` | *(auto)* | Explicit binary paths (override → `PATH` → known dirs) |
| `ERROR_CODES_PATH` | *(auto)* | Location of the exported DCCNN registry |

## Error codes

Every failure carries a DCCNN chip in `<message> [ERROR_CODE: DCCNN]` form.
The registry is authored once in `packages/shared/src/error-codes.ts`, exported
to `packages/shared/generated/error-codes.json`, and read here at boot — this
service never re-declares codes. Missing artifact → a small inline fallback,
logged loudly, with `/health` reporting which source was used.

## The resolve ladder

`yt-dlp` answers with a different format set depending on which player client
responds, and any given client can start refusing a particular video outright.
One hard-coded client therefore breaks track by track. The ladder tries the
built-in client order, and the classification of each failure decides what
happens next:

- **Extractor failure** (`Requested format is not available`, bot checks) →
  ask the next client.
- **Transport failure** (disk, DNS, missing ffmpeg) → stop; no client can fix
  it, and walking the ladder only makes the failure slower to surface.
- **Success** → cache the URL for `ENGINE_DIRECT_URL_TTL`.

## Development

```bash
uv sync --extra dev
uv run python -m pytest -q
uv run python -m pyflakes app
uv run python -m app.main
```
