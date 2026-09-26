# Error codes

Every user-facing failure carries a five-character **DCCNN** code —
`[ERROR_CODE: DEX01]` — appended to the message and emitted as a structured `code`
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
| [ERROR_CODE: ASE01] | Not signed in |
| [ERROR_CODE: ASE02] | Session expired or invalid |
| [ERROR_CODE: ACF01] | You don't have access to this |

## Playlists (P)

| Code | Meaning |
| --- | --- |
| [ERROR_CODE: PNF01] | Playlist not found |
| [ERROR_CODE: PNF02] | Track not found in playlist |
| [ERROR_CODE: PCN01] | Playlist already exists |
| [ERROR_CODE: PCN02] | Track is already in this playlist |
| [ERROR_CODE: PCF01] | Cannot modify a smart playlist here |
| [ERROR_CODE: PVA01] | Playlist name is required |
| [ERROR_CODE: PVA02] | Playlist name is too long |
| [ERROR_CODE: PVA03] | Invalid track list |
| [ERROR_CODE: PVA04] | Invalid playlist id |
| [ERROR_CODE: PVA05] | A URL is required |
| [ERROR_CODE: PVA06] | A playlist is required |
| [ERROR_CODE: PVA07] | Reorder list must match the playlist's tracks |
| [ERROR_CODE: PVA08] | Smart playlist rule is invalid |
| [ERROR_CODE: PVA09] | A track id is required |
| [ERROR_CODE: PEX01] | Import failed — the file could not be read |
| [ERROR_CODE: PEX02] | Export failed — playlist is empty |
| [ERROR_CODE: PUP01] | No playable tracks found at that URL |

## Tracks (T)

| Code | Meaning |
| --- | --- |
| [ERROR_CODE: TNF01] | Track not found |
| [ERROR_CODE: TNF02] | History is empty |
| [ERROR_CODE: TVA01] | Invalid track id |
| [ERROR_CODE: TVA02] | Unknown listening signal |
| [ERROR_CODE: TEX01] | Could not update the like |
| [ERROR_CODE: TEX02] | Could not record the play |

## Downloads (D)

| Code | Meaning |
| --- | --- |
| [ERROR_CODE: DNF01] | Download job not found |
| [ERROR_CODE: DVA01] | Invalid URL format |
| [ERROR_CODE: DVA02] | URL too long |
| [ERROR_CODE: DVA03] | Track id or URL is required |
| [ERROR_CODE: DVA04] | Invalid track id |
| [ERROR_CODE: DVA05] | Invalid job id |
| [ERROR_CODE: DVA06] | Invalid quality |
| [ERROR_CODE: DVA07] | Invalid format |
| [ERROR_CODE: DVA08] | Invalid speed limit |
| [ERROR_CODE: DVA09] | Invalid concurrency |
| [ERROR_CODE: DVA10] | No tracks were given |
| [ERROR_CODE: DCN01] | That download is already running |
| [ERROR_CODE: DCN02] | Directory already registered |
| [ERROR_CODE: DLM01] | Download limit reached — try again shortly |
| [ERROR_CODE: DFS01] | A music directory is required |
| [ERROR_CODE: DFS02] | Path is outside the configured music directories |
| [ERROR_CODE: DFS03] | Could not read the directory |
| [ERROR_CODE: DEN01] | The download could not start on this server |
| [ERROR_CODE: DEN02] | The download engine is not installed on this server |
| [ERROR_CODE: DEN03] | Audio conversion is unavailable on this server |
| [ERROR_CODE: DEX01] | Download failed |

## Streaming (S)

| Code | Meaning |
| --- | --- |
| [ERROR_CODE: SNF01] | Track not found locally and the id is not a valid remote track |
| [ERROR_CODE: SNF02] | Not downloaded locally |
| [ERROR_CODE: SVA01] | Range not satisfiable |
| [ERROR_CODE: SVA02] | Artwork host is not allowed |
| [ERROR_CODE: SVA03] | Invalid track id |
| [ERROR_CODE: SEX01] | Stream not ready for seeking yet |
| [ERROR_CODE: SEX02] | Stream warm-up failed |
| [ERROR_CODE: SLM01] | Too many concurrent streams, try again shortly |
| [ERROR_CODE: SUP01] | Track not available |
| [ERROR_CODE: SUP02] | Could not stream this track. YouTube may be rate-limiting |
| [ERROR_CODE: SUP03] | Track temporarily unavailable (recent failure cached) |
| [ERROR_CODE: SUP04] | Could not fetch the artwork |

## Search / resolve (R)

| Code | Meaning |
| --- | --- |
| [ERROR_CODE: RNF01] | No lyrics found for this track |
| [ERROR_CODE: RNF02] | Unknown trending category |
| [ERROR_CODE: RVA01] | Track id or URL is required |
| [ERROR_CODE: RVA02] | Unsupported or unresolvable URL |
| [ERROR_CODE: RVA03] | Invalid lyrics request |
| [ERROR_CODE: RVA04] | The search query cannot be empty |
| [ERROR_CODE: RUP01] | Could not look up this track right now |

## Library (L)

| Code | Meaning |
| --- | --- |
| [ERROR_CODE: LNF01] | Directory not found |
| [ERROR_CODE: LNF02] | Artist not found |
| [ERROR_CODE: LNF03] | Album not found |
| [ERROR_CODE: LNF04] | Album not found for this track |
| [ERROR_CODE: LVA01] | Invalid scan options |
| [ERROR_CODE: LVA02] | Backup file is invalid |
| [ERROR_CODE: LCN01] | Scan is already running |
| [ERROR_CODE: LEX01] | Backup export failed |
| [ERROR_CODE: LEX02] | Backup restore failed |
| [ERROR_CODE: LEX03] | Could not persist the music directories |
| [ERROR_CODE: LEN01] | Database not available |

## Settings (E)

| Code | Meaning |
| --- | --- |
| [ERROR_CODE: ENF01] | Preset not found |
| [ERROR_CODE: EVA01] | Unknown setting |
| [ERROR_CODE: EVA02] | Value out of range for this setting |
| [ERROR_CODE: EVA03] | Invalid preset |
| [ERROR_CODE: EVA04] | Preset name is required |
| [ERROR_CODE: EVA05] | Invalid equalizer bands |
| [ERROR_CODE: EVA06] | Invalid visitor counter payload |
| [ERROR_CODE: EVA07] | Invalid preferences payload |
| [ERROR_CODE: EEN01] | Preference sync needs the database. Your settings still work |

## Webhooks (W)

| Code | Meaning |
| --- | --- |
| [ERROR_CODE: WEN01] | Webhook secret not configured |
| [ERROR_CODE: WVA01] | Missing webhook headers |
| [ERROR_CODE: WVA02] | Webhook timestamp expired |
| [ERROR_CODE: WVA03] | Invalid webhook payload |
| [ERROR_CODE: WVA04] | Webhook user is missing an id |
| [ERROR_CODE: WVA05] | Webhook event type is not supported |
| [ERROR_CODE: WCF01] | Invalid webhook signature |

## Artists (F)

| Code | Meaning |
| --- | --- |
| [ERROR_CODE: FVA01] | Invalid artist id |
| [ERROR_CODE: FVA02] | Provide a list of artist names |
| [ERROR_CODE: FVA03] | Provide at least one artist name |
| [ERROR_CODE: FEX01] | Artist follow could not be saved |

## Playback (Y)

| Code | Meaning |
| --- | --- |
| [ERROR_CODE: YEN01] | Equalizer is not supported on this device |
