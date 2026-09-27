/**
 * Rheoson DCCNN error-code registry — the shared contract.
 *
 * Ported 1:1 from the Python `app/core/error_codes.py` registry (v2.22.1):
 * same codes, same copy, same wire format. The Python engine imports the
 * JSON export of THIS module at build time, so the two languages can never
 * drift. Change a code here and both sides change together — or the test
 * suite fails.
 *
 *   D  = domain   (one letter: D=downloads, A=auth, M=messaging, B=blends, …)
 *   CC = category (two letters: VA=validation, NF=not-found, EX=execution, …)
 *   NN = number   (two digits, sequential inside domain+category)
 *
 * Wire format everywhere: `Human copy [ERROR_CODE: DEX01]`.
 */

export const ERROR_CODE_WIRE = '[ERROR_CODE' as const;

/** One DCCNN code: `DEX01`, `MVA01`, `BNF01`, … */
export type ErrorCode = string;

interface SectionDef {
  name: string;
  letter: string;
  members: Record<string, string>;
  messages: Record<string, string>;
}

// ── Domains ───────────────────────────────────────────────────
// Codes and copy are identical to the Python registry. Keep the sections
// in the same order as error_codes.py so a side-by-side diff stays easy.

const SECTIONS: SectionDef[] = [
  {
    name: 'AUTH',
    letter: 'A',
    members: {
      NOT_SIGNED_IN: 'ASE01',
      INVALID_TOKEN: 'ASE02',
      FORBIDDEN: 'ACF01',
    },
    messages: {
      ASE01: 'Not signed in',
      ASE02: 'Session expired or invalid',
      ACF01: "You don't have access to this",
    },
  },
  {
    name: 'PLAYLIST',
    letter: 'P',
    members: {
      NOT_FOUND: 'PNF01',
      TRACK_NOT_IN_PLAYLIST: 'PNF02',
      ALREADY_EXISTS: 'PCN01',
      TRACK_DUPLICATE: 'PCN02',
      SMART_READONLY: 'PCF01',
      NAME_REQUIRED: 'PVA01',
      NAME_TOO_LONG: 'PVA02',
      INVALID_TRACK_LIST: 'PVA03',
      INVALID_ID: 'PVA04',
      URL_REQUIRED: 'PVA05',
      NAME_REQUIRED_IMPORT: 'PVA06',
      REORDER_MISMATCH: 'PVA07',
      SMART_RULE_INVALID: 'PVA08',
      TRACK_ID_REQUIRED: 'PVA09',
      IMPORT_FAILED: 'PEX01',
      EXPORT_EMPTY: 'PEX02',
      NO_PLAYABLE_TRACKS: 'PUP01',
    },
    messages: {
      PNF01: 'Playlist not found',
      PNF02: 'Track not found in playlist',
      PCN01: 'Playlist already exists',
      PCN02: 'Track is already in this playlist',
      PCF01: 'Cannot modify a smart playlist here',
      PVA01: 'Playlist name is required',
      PVA02: 'Playlist name is too long',
      PVA03: 'Invalid track list',
      PVA04: 'Invalid playlist id',
      PVA05: 'A URL is required',
      PVA06: 'A playlist is required',
      PVA07: "Reorder list must match the playlist's tracks",
      PVA08: 'Smart playlist rule is invalid',
      PVA09: 'A track id is required',
      PEX01: 'Import failed — the file could not be read',
      PEX02: 'Export failed — playlist is empty',
      PUP01: 'No playable tracks found at that URL',
    },
  },
  {
    name: 'TRACK',
    letter: 'T',
    members: {
      NOT_FOUND: 'TNF01',
      HISTORY_EMPTY: 'TNF02',
      INVALID_ID: 'TVA01',
      SIGNAL_UNKNOWN: 'TVA02',
      LIKE_FAILED: 'TEX01',
      PLAY_FAILED: 'TEX02',
    },
    messages: {
      TNF01: 'Track not found',
      TNF02: 'History is empty',
      TVA01: 'Invalid track id',
      TVA02: 'Unknown listening signal',
      TEX01: 'Could not update the like',
      TEX02: 'Could not record the play',
    },
  },
  {
    name: 'DOWNLOAD',
    letter: 'D',
    members: {
      JOB_NOT_FOUND: 'DNF01',
      INVALID_URL: 'DVA01',
      URL_TOO_LONG: 'DVA02',
      TARGET_REQUIRED: 'DVA03',
      INVALID_TRACK_ID: 'DVA04',
      INVALID_JOB_ID: 'DVA05',
      INVALID_QUALITY: 'DVA06',
      INVALID_FORMAT: 'DVA07',
      INVALID_SPEED: 'DVA08',
      INVALID_CONCURRENCY: 'DVA09',
      INVALID_TRACK_LIST: 'DVA10',
      JOB_ALREADY_RUNNING: 'DCN01',
      DIR_REGISTERED: 'DCN02',
      LIMIT_REACHED: 'DLM01',
      DIR_REQUIRED: 'DFS01',
      PATH_OUTSIDE: 'DFS02',
      DIR_UNREADABLE: 'DFS03',
      SPAWN_FAILED: 'DEN01',
      ENGINE_MISSING: 'DEN02',
      CONVERSION_UNAVAILABLE: 'DEN03',
      FAILED: 'DEX01',
    },
    messages: {
      DNF01: 'Download job not found',
      DVA01: 'Invalid URL format',
      DVA02: 'URL too long',
      DVA03: 'Track id or URL is required',
      DVA04: 'Invalid track id',
      DVA05: 'Invalid job id',
      DVA06: 'Invalid quality',
      DVA07: 'Invalid format',
      DVA08: 'Invalid speed limit',
      DVA09: 'Invalid concurrency',
      DVA10: 'No tracks were given',
      DCN01: 'That download is already running',
      DCN02: 'Directory already registered',
      DLM01: 'Download limit reached — try again shortly',
      DFS01: 'A music directory is required',
      DFS02: 'Path is outside the configured music directories',
      DFS03: 'Could not read the directory',
      DEN01: 'The download could not start on this server',
      DEN02: 'The download engine is not installed on this server',
      DEN03: 'Audio conversion is unavailable on this server',
      DEX01: 'Download failed',
    },
  },
  {
    name: 'STREAM',
    letter: 'S',
    members: {
      NOT_FOUND_REMOTE_INVALID: 'SNF01',
      NOT_DOWNLOADED_LOCALLY: 'SNF02',
      RANGE_INVALID: 'SVA01',
      ARTWORK_HOST_DENIED: 'SVA02',
      INVALID_TRACK_ID: 'SVA03',
      NOT_SEEKABLE_YET: 'SEX01',
      WARMUP_FAILED: 'SEX02',
      TOO_MANY_STREAMS: 'SLM01',
      NOT_AVAILABLE: 'SUP01',
      UPSTREAM_REFUSED: 'SUP02',
      FAILURE_CACHED: 'SUP03',
      ARTWORK_FAILED: 'SUP04',
    },
    messages: {
      SNF01: 'Track not found locally and the id is not a valid remote track',
      SNF02: 'Not downloaded locally',
      SVA01: 'Range not satisfiable',
      SVA02: 'Artwork host is not allowed',
      SVA03: 'Invalid track id',
      SEX01: 'Stream not ready for seeking yet',
      SEX02: 'Stream warm-up failed',
      SLM01: 'Too many concurrent streams, try again shortly',
      SUP01: 'Track not available',
      SUP02: 'Could not stream this track. YouTube may be rate-limiting',
      SUP03: 'Track temporarily unavailable (recent failure cached)',
      SUP04: 'Could not fetch the artwork',
    },
  },
  {
    name: 'SEARCH',
    letter: 'R',
    members: {
      LYRICS_NOT_FOUND: 'RNF01',
      CATEGORY_UNKNOWN: 'RNF02',
      TARGET_REQUIRED: 'RVA01',
      UNSUPPORTED_URL: 'RVA02',
      LYRICS_INVALID: 'RVA03',
      QUERY_EMPTY: 'RVA04',
      RESOLVE_FAILED: 'RUP01',
    },
    messages: {
      RNF01: 'No lyrics found for this track',
      RNF02: 'Unknown trending category',
      RVA01: 'Track id or URL is required',
      RVA02: 'Unsupported or unresolvable URL',
      RVA03: 'Invalid lyrics request',
      RVA04: 'The search query cannot be empty',
      RUP01: 'Could not look up this track right now',
    },
  },
  {
    name: 'LIBRARY',
    letter: 'L',
    members: {
      DIR_NOT_FOUND: 'LNF01',
      ARTIST_NOT_FOUND: 'LNF02',
      ALBUM_NOT_FOUND: 'LNF03',
      ALBUM_FOR_TRACK_NOT_FOUND: 'LNF04',
      SCAN_INVALID: 'LVA01',
      BACKUP_FILE_INVALID: 'LVA02',
      SCAN_RUNNING: 'LCN01',
      BACKUP_EXPORT_FAILED: 'LEX01',
      BACKUP_RESTORE_FAILED: 'LEX02',
      DIRS_PERSIST_FAILED: 'LEX03',
      DB_UNAVAILABLE: 'LEN01',
    },
    messages: {
      LNF01: 'Directory not found',
      LNF02: 'Artist not found',
      LNF03: 'Album not found',
      LNF04: 'Album not found for this track',
      LVA01: 'Invalid scan options',
      LVA02: 'Backup file is invalid',
      LCN01: 'Scan is already running',
      LEX01: 'Backup export failed',
      LEX02: 'Backup restore failed',
      LEX03: 'Could not persist the music directories',
      LEN01: 'Database not available',
    },
  },
  {
    name: 'SETTINGS',
    letter: 'E',
    members: {
      PRESET_NOT_FOUND: 'ENF01',
      UNKNOWN_KEY: 'EVA01',
      VALUE_OUT_OF_RANGE: 'EVA02',
      PRESET_INVALID: 'EVA03',
      PRESET_NAME_REQUIRED: 'EVA04',
      EQ_BANDS_INVALID: 'EVA05',
      VISITOR_PAYLOAD_INVALID: 'EVA06',
      PREFS_INVALID: 'EVA07',
      PREFS_DB_UNAVAILABLE: 'EEN01',
    },
    messages: {
      ENF01: 'Preset not found',
      EVA01: 'Unknown setting',
      EVA02: 'Value out of range for this setting',
      EVA03: 'Invalid preset',
      EVA04: 'Preset name is required',
      EVA05: 'Invalid equalizer bands',
      EVA06: 'Invalid visitor counter payload',
      EVA07: 'Invalid preferences payload',
      EEN01: 'Preference sync needs the database. Your settings still work',
    },
  },
  {
    name: 'WEBHOOK',
    letter: 'W',
    members: {
      SECRET_UNCONFIGURED: 'WEN01',
      HEADERS_MISSING: 'WVA01',
      TIMESTAMP_EXPIRED: 'WVA02',
      PAYLOAD_INVALID: 'WVA03',
      USER_ID_MISSING: 'WVA04',
      EVENT_UNSUPPORTED: 'WVA05',
      SIGNATURE_INVALID: 'WCF01',
    },
    messages: {
      WEN01: 'Webhook secret not configured',
      WVA01: 'Missing webhook headers',
      WVA02: 'Webhook timestamp expired',
      WVA03: 'Invalid webhook payload',
      WVA04: 'Webhook user is missing an id',
      WVA05: 'Webhook event type is not supported',
      WCF01: 'Invalid webhook signature',
    },
  },
  {
    name: 'ARTIST',
    letter: 'F',
    members: {
      INVALID_ID: 'FVA01',
      ONBOARD_LIST_REQUIRED: 'FVA02',
      ONBOARD_NAME_REQUIRED: 'FVA03',
      FOLLOW_FAILED: 'FEX01',
    },
    messages: {
      FVA01: 'Invalid artist id',
      FVA02: 'Provide a list of artist names',
      FVA03: 'Provide at least one artist name',
      FEX01: 'Artist follow could not be saved',
    },
  },
  {
    name: 'MESSAGING',
    letter: 'M',
    members: {
      CHAT_NOT_FOUND: 'MNF01',
      PEER_NOT_FOUND: 'MNF02',
      MESSAGE_EMPTY: 'MVA01',
      MESSAGE_TOO_LONG: 'MVA02',
      SHARE_INVALID: 'MVA03',
      CONVERSATION_INVALID: 'MVA04',
      SEND_FAILED: 'MEX01',
      RATE_LIMITED: 'MLM01',
      SERVICE_UNAVAILABLE: 'MEN01',
    },
    messages: {
      MNF01: 'Conversation not found',
      MNF02: "That user isn't on Rheoson yet",
      MVA01: "Message can't be empty",
      MVA02: 'Message is too long',
      MVA03: 'Invalid share',
      MVA04: 'Invalid conversation',
      MEX01: 'Message could not be sent',
      MLM01: 'Sending too fast — slow down a moment',
      MEN01: 'Messaging needs the database',
    },
  },
  {
    name: 'BLENDS',
    letter: 'B',
    members: {
      NOT_FOUND: 'BNF01',
      MEMBER_NOT_FOUND: 'BNF02',
      NAME_REQUIRED: 'BVA01',
      NAME_TOO_LONG: 'BVA02',
      ID_INVALID: 'BVA03',
      TRACKS_INVALID: 'BVA04',
      MEMBERS_INVALID: 'BVA05',
      ALREADY_MEMBER: 'BCN01',
      ALREADY_TRACK: 'BCN02',
      NAME_CONFLICT: 'BCN03',
      DELETE_FORBIDDEN: 'BCF01',
      TRACK_REMOVED: 'BCF02',
      ADD_FAILED: 'BEX01',
      REMOVE_FAILED: 'BEX02',
      DB_UNAVAILABLE: 'BEN01',
    },
    messages: {
      BNF01: 'Blend not found',
      BNF02: 'That member is not in this blend',
      BVA01: 'Blend name is required',
      BVA02: 'Blend name is too long',
      BVA03: 'Invalid blend id',
      BVA04: 'Invalid track list',
      BVA05: 'Invalid member list',
      BCN01: 'Already a member of this blend',
      BCN02: 'Track is already in this blend',
      BCN03: 'You already have a blend with that name',
      BCF01: 'Only the owner can delete a blend',
      BCF02: 'This track is not in the blend',
      BEX01: 'Could not add the track to the blend',
      BEX02: 'Could not remove the track from the blend',
      BEN01: 'Blends need the database',
    },
  },
  {
    name: 'PLAYBACK',
    letter: 'Y',
    members: {
      EQ_UNSUPPORTED: 'YEN01',
    },
    messages: {
      YEN01: 'Equalizer is not supported on this device',
    },
  },
];

// ── Derived registries ────────────────────────────────────────

/** code → human message, the full flat registry. */
export const ERROR_MESSAGES: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(SECTIONS.flatMap((s) => Object.entries(s.messages)))
);

/** Named sections: `ERROR_DOMAINS.DOWNLOAD.FAILED === 'DEX01'`. */
export const ERROR_DOMAINS: Record<string, Record<string, string>> = Object.fromEntries(
  SECTIONS.map((s) => [s.name, { ...s.members }])
);

/** Domain name → its DCCNN letter (SEARCH is R for seaRch, SETTINGS is E, …). */
export const DOMAIN_LETTERS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(SECTIONS.map((s) => [s.name, s.letter]))
);

/** Every registered code — uniqueness is enforced by the test suite. */
export const ALL_ERROR_CODES: readonly string[] = Object.freeze(Object.keys(ERROR_MESSAGES));

const DCCNN_RE = /^[A-Z]{3}\d{2}$/;

/** True when the string is a well-formed, registered DCCNN code. */
export function isRegisteredCode(code: string): boolean {
  return DCCNN_RE.test(code) && code in ERROR_MESSAGES;
}

/** Human message for a code (throws on unknown — programming error). */
export function messageForCode(code: string): string {
  const msg = ERROR_MESSAGES[code];
  if (msg === undefined) {
    throw new Error(`error code ${code} is not registered`);
  }
  return msg;
}

/**
 * Suffix a detail string with the machine-readable wire chip.
 * `fail('DEX01', 500)` → `Download failed [ERROR_CODE: DEX01]`.
 */
export function wireDetail(code: string, message?: string): string {
  const base = message ?? messageForCode(code);
  return `${base} [ERROR_CODE: ${code}]`;
}

/** JSON export consumed by the Python engine at build/boot time. */
export function errorRegistryJson(): string {
  return JSON.stringify(
    {
      wire: '[ERROR_CODE: DCCNN]',
      codes: ERROR_MESSAGES,
      domains: ERROR_DOMAINS,
    },
    null,
    2
  );
}
