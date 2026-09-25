# Error codes

Every user-facing failure carries a five-character **DCCNN** code —
`[ERR DEX01]` — appended to the message and emitted as a structured `code`
field in the response body.

    D  = domain   (one letter: D=downloads, A=auth, P=playlists, …)
    CC = category (two letters: VA=validation, NF=not-found, EX=execution, …)
    NN = number   (two digits, sequential inside domain+category)

`DEX01` reads as "downloads / execution / first one". Search the code below —
or grep the API source for it — to land on the single raise site.

## Domains

| Letter | Domain |
| --- | --- |
| A | Auth |
| P | Playlists |
| T | Tracks, likes, history |
| D | Downloads |
| S | Streaming |
| R | Search / resolve / lyrics |
| L | Library, directories, backups |
| E | sE=Settings, preferences, presets |
| W | Webhooks |
| F | Artist follows |
| Y | plaYback (equalizer) |

## Categories

| Code | Meaning |
| --- | --- |
| SE | session / identity |
| CF | forbidden / access control |
| NF | not found |
| VA | validation |
| CN | conflict / state |
| LM | limit / rate |
| FS | filesystem / path |
| EN | engine / dependency unavailable |
| EX | execution failed |
| UP | upstream refused |

## Auth (A)

| Code | Meaning |
| --- | --- |
| [ERR ASE01] | Not signed in |
| [ERR ASE02] | Session expired or invalid |
| [ERR ACF01] | You don't have access to this |

## Playlists (P)

| Code | Meaning |
| --- | --- |
| [ERR PNF01] | Playlist not found |
| [ERR PNF02] | Track not found in playlist |
| [ERR PCN01] | Playlist already exists |
| [ERR PCN02] | Track is already in this playlist |
| [ERR PCF01] | Cannot modify a smart playlist here |
| [ERR PVA01] | Playlist name is required |
| [ERR PVA02] | Playlist name is too long |
| [ERR PVA03] | Invalid track list |
| [ERR PVA04] | Invalid playlist id |
| [ERR PVA05] | A URL is required |
| [ERR PVA06] | A playlist is required |
| [ERR PVA07] | Reorder list must match the playlist's tracks |
| [ERR PVA08] | Smart playlist rule is invalid |
| [ERR PVA09] | A track id is required |
| [ERR PEX01] | Import failed — the file could not be read |
| [ERR PEX02] | Export failed — playlist is empty |
| [ERR PUP01] | No playable tracks found at that URL |

## Tracks (T)

| Code | Meaning |
| --- | --- |
| [ERR TNF01] | Track not found |
| [ERR TNF02] | History is empty |
| [ERR TVA01] | Invalid track id |
| [ERR TVA02] | Unknown listening signal |
| [ERR TEX01] | Could not update the like |
| [ERR TEX02] | Could not record the play |

## Downloads (D)

| Code | Meaning |
| --- | --- |
| [ERR DNF01] | Download job not found |
| [ERR DVA01] | Invalid URL format |
| [ERR DVA02] | URL too long |
| [ERR DVA03] | Track id or URL is required |
| [ERR DVA04] | Invalid track id |
| [ERR DVA05] | Invalid job id |
| [ERR DVA06] | Invalid quality |
| [ERR DVA07] | Invalid format |
| [ERR DVA08] | Invalid speed limit |
| [ERR DVA09] | Invalid concurrency |
| [ERR DVA10] | No tracks were given |
| [ERR DCN01] | That download is already running |
| [ERR DCN02] | Directory already registered |
| [ERR DLM01] | Download limit reached — try again shortly |
| [ERR DFS01] | A music directory is required |
| [ERR DFS02] | Path is outside the configured music directories |
| [ERR DFS03] | Could not read the directory |
| [ERR DEN01] | The download could not start on this server |
| [ERR DEN02] | The download engine is not installed on this server |
| [ERR DEN03] | Audio conversion is unavailable on this server |
| [ERR DEX01] | Download failed |

## Streaming (S)

| Code | Meaning |
| --- | --- |
| [ERR SNF01] | Track not found locally and the id is not a valid remote track |
| [ERR SNF02] | Not downloaded locally |
| [ERR SVA01] | Range not satisfiable |
| [ERR SVA02] | Artwork host is not allowed |
| [ERR SVA03] | Invalid track id |
| [ERR SEX01] | Stream not ready for seeking yet |
| [ERR SEX02] | Stream warm-up failed |
| [ERR SLM01] | Too many concurrent streams, try again shortly |
| [ERR SUP01] | Track not available |
| [ERR SUP02] | Could not stream this track. YouTube may be rate-limiting |
| [ERR SUP03] | Track temporarily unavailable (recent failure cached) |
| [ERR SUP04] | Could not fetch the artwork |

## Search / resolve (R)

| Code | Meaning |
| --- | --- |
| [ERR RNF01] | No lyrics found for this track |
| [ERR RNF02] | Unknown trending category |
| [ERR RVA01] | Track id or URL is required |
| [ERR RVA02] | Unsupported or unresolvable URL |
| [ERR RVA03] | Invalid lyrics request |
| [ERR RVA04] | The search query cannot be empty |
| [ERR RUP01] | Could not look up this track right now |

## Library (L)

| Code | Meaning |
| --- | --- |
| [ERR LNF01] | Directory not found |
| [ERR LNF02] | Artist not found |
| [ERR LNF03] | Album not found |
| [ERR LNF04] | Album not found for this track |
| [ERR LVA01] | Invalid scan options |
| [ERR LVA02] | Backup file is invalid |
| [ERR LCN01] | Scan is already running |
| [ERR LEX01] | Backup export failed |
| [ERR LEX02] | Backup restore failed |
| [ERR LEX03] | Could not persist the music directories |
| [ERR LEN01] | Database not available |

## Settings (E)

| Code | Meaning |
| --- | --- |
| [ERR ENF01] | Preset not found |
| [ERR EVA01] | Unknown setting |
| [ERR EVA02] | Value out of range for this setting |
| [ERR EVA03] | Invalid preset |
| [ERR EVA04] | Preset name is required |
| [ERR EVA05] | Invalid equalizer bands |
| [ERR EVA06] | Invalid visitor counter payload |
| [ERR EVA07] | Invalid preferences payload |
| [ERR EEN01] | Preference sync needs the database. Your settings still work |

## Webhooks (W)

| Code | Meaning |
| --- | --- |
| [ERR WEN01] | Webhook secret not configured |
| [ERR WVA01] | Missing webhook headers |
| [ERR WVA02] | Webhook timestamp expired |
| [ERR WVA03] | Invalid webhook payload |
| [ERR WVA04] | Webhook user is missing an id |
| [ERR WVA05] | Webhook event type is not supported |
| [ERR WCF01] | Invalid webhook signature |

## Artists (F)

| Code | Meaning |
| --- | --- |
| [ERR FVA01] | Invalid artist id |
| [ERR FVA02] | Provide a list of artist names |
| [ERR FVA03] | Provide at least one artist name |
| [ERR FEX01] | Artist follow could not be saved |

## Playback (Y)

| Code | Meaning |
| --- | --- |
| [ERR YEN01] | Equalizer is not supported on this device |
