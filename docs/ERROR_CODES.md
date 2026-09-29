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
| M | Messaging |
| B | Blends (collaborative playlists) |
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
| [ERROR_CODE: PVA03] | Invalid track list |
| [ERROR_CODE: PVA05] | A URL is required |
| [ERROR_CODE: PVA07] | Reorder list must match the playlist's tracks |
| [ERROR_CODE: PVA09] | A track id is required |
| [ERROR_CODE: PUP01] | No playable tracks found at that URL |

## Tracks (T)

| Code | Meaning |
| --- | --- |
| [ERROR_CODE: TNF01] | Track not found |
| [ERROR_CODE: TVA02] | Unknown listening signal |

## Downloads (D)

| Code | Meaning |
| --- | --- |
| [ERROR_CODE: DNF01] | Download job not found |
| [ERROR_CODE: DVA01] | Invalid URL format |
| [ERROR_CODE: DVA02] | URL too long |
| [ERROR_CODE: DVA03] | Track id or URL is required |
| [ERROR_CODE: DVA04] | Invalid track id |
| [ERROR_CODE: DVA05] | Invalid job id |
| [ERROR_CODE: DVA10] | No tracks were given |
| [ERROR_CODE: DLM01] | Download limit reached — try again shortly |
| [ERROR_CODE: DFS01] | A music directory is required |
| [ERROR_CODE: DFS02] | Path is outside the configured music directories |
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

## Search / resolve (R)

| Code | Meaning |
| --- | --- |
| [ERROR_CODE: RNF02] | Unknown trending category |
| [ERROR_CODE: RVA01] | Track id or URL is required |
| [ERROR_CODE: RVA04] | The search query cannot be empty |

## Library (L)

| Code | Meaning |
| --- | --- |
| [ERROR_CODE: LNF01] | Directory not found |
| [ERROR_CODE: LVA01] | Invalid scan options |
| [ERROR_CODE: LVA02] | Backup file is invalid |
| [ERROR_CODE: LEX03] | Could not persist the music directories |
| [ERROR_CODE: LEN01] | Database not available |

## Settings (E)

| Code | Meaning |
| --- | --- |
| [ERROR_CODE: ENF01] | Preset not found |
| [ERROR_CODE: EEN01] | Preference sync needs the database. Your settings still work |

## Webhooks (W)

| Code | Meaning |
| --- | --- |
| [ERROR_CODE: WEN01] | Webhook secret not configured |
| [ERROR_CODE: WVA01] | Missing webhook headers |
| [ERROR_CODE: WVA02] | Webhook timestamp expired |
| [ERROR_CODE: WVA03] | Invalid webhook payload |
| [ERROR_CODE: WCF01] | Invalid webhook signature |

## Artists (F)

| Code | Meaning |
| --- | --- |
| [ERROR_CODE: FVA01] | Invalid artist id |
| [ERROR_CODE: FVA02] | Provide a list of artist names |
| [ERROR_CODE: FVA03] | Provide at least one artist name |

## Messaging (M)

| Code | Message |
| --- | --- |
| [ERROR_CODE: MVA01] | Message can't be empty |
| [ERROR_CODE: MVA02] | Message is too long |
| [ERROR_CODE: MVA03] | Invalid share |
| [ERROR_CODE: MVA04] | Invalid conversation |
| [ERROR_CODE: MEX01] | Message could not be sent |
| [ERROR_CODE: MLM01] | Sending too fast — slow down a moment |
| [ERROR_CODE: MEN01] | Messaging needs the database |

## Blends (B)

| Code | Message |
| --- | --- |
| [ERROR_CODE: BNF01] | Blend not found |
| [ERROR_CODE: BNF02] | That member is not in this blend |
| [ERROR_CODE: BVA01] | Blend name is required |
| [ERROR_CODE: BVA02] | Blend name is too long |
| [ERROR_CODE: BVA03] | Invalid blend id |
| [ERROR_CODE: BVA04] | Invalid track list |
| [ERROR_CODE: BVA05] | Invalid member list |
| [ERROR_CODE: BCN01] | Already a member of this blend |
| [ERROR_CODE: BCN02] | Track is already in this blend |
| [ERROR_CODE: BCF01] | Only the owner can delete a blend |
| [ERROR_CODE: BCF02] | This track is not in the blend |
| [ERROR_CODE: BEX01] | Could not add the track to the blend |
| [ERROR_CODE: BEX02] | Could not remove the track from the blend |
| [ERROR_CODE: BEN01] | Blends need the database |

## Playback (Y)

| Code | Meaning |
| --- | --- |
