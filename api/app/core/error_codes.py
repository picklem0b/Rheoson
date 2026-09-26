"""User-facing error codes — DCCNN: Domain, Category, sequence Number.

Every user-visible failure carries a five-character code, e.g. ``[ERR DEX01]``:

    D  = domain   (one letter: D=downloads, A=auth, P=playlists, …)
    CC = category (two letters: VA=validation, NF=not-found, EX=execution, …)
    NN = number   (two digits, sequential inside domain+category)

``DEX01`` reads as "downloads / execution / first one" — and grepping the code
lands on its single raise site. The full map lives in ``docs/ERROR_CODES.md``.

A code must exist in ``_REGISTRY`` before ``fail()`` will raise it — an
unregistered code is a programming error, not something to guess at runtime.
Uniqueness and shape are pinned by ``tests/test_error_codes.py`` so two errors
can never share a code (which would make codes useless for tracing).

Category codes are shared vocabulary across domains:

    SE session/identity    CF forbidden/access   NF not found
    VA validation          CN conflict/state     EX execution failed
    LM limit/rate          FS filesystem/path    EN engine/dependency
    UP upstream refused    SY (reserved)
"""

from __future__ import annotations

import re

from fastapi import HTTPException

#: The DCCNN shape: one domain letter, two category letters, two digits.
CODE_RE = re.compile(r"^[A-Z]{3}\d{2}$")


class _Section:
    """Named access to one domain's codes (``DOWNLOAD.FAILED`` → ``DEX01``)."""

    def __init__(self, name: str, letter: str, members: dict[str, str]):
        assert len(letter) == 1 and letter.isalpha(), letter
        self._name   = name
        self.letter  = letter
        self._codes  = dict(members)
        for attr, code in members.items():
            assert code.startswith(letter), (
                f"{name}.{attr} = {code} does not start with the domain letter"
            )
            setattr(self, attr, code)

    def __contains__(self, code: str) -> bool:
        return code in self._codes.values()

    def __iter__(self):
        return iter(self._codes.values())

    def __repr__(self) -> str:  # debugging aid only
        return f"<_Section {self._name} domain={self.letter}>"


# ── Domains ───────────────────────────────────────────────────
#
# One letter per subsystem. Routers raise through the named members —
# ``fail(DOWNLOAD.JOB_NOT_FOUND, 404)`` — never raw strings, so a renumbering
# stays inside this module.

AUTH = _Section("AUTH", "A", {
    "NOT_SIGNED_IN": "ASE01",   # session: no credentials on a guarded route
    "INVALID_TOKEN": "ASE02",   # session: presented but invalid/expired
    "FORBIDDEN":     "ACF01",   # access control: signed in, not allowed
})

PLAYLIST = _Section("PLAYLIST", "P", {
    "NOT_FOUND":             "PNF01",
    "TRACK_NOT_IN_PLAYLIST": "PNF02",
    "ALREADY_EXISTS":        "PCN01",
    "TRACK_DUPLICATE":       "PCN02",
    "SMART_READONLY":        "PCF01",
    "NAME_REQUIRED":         "PVA01",
    "NAME_TOO_LONG":         "PVA02",
    "INVALID_TRACK_LIST":    "PVA03",
    "INVALID_ID":            "PVA04",
    "URL_REQUIRED":          "PVA05",
    "NAME_REQUIRED_IMPORT":  "PVA06",
    "REORDER_MISMATCH":      "PVA07",
    "SMART_RULE_INVALID":    "PVA08",
    "TRACK_ID_REQUIRED":     "PVA09",
    "IMPORT_FAILED":         "PEX01",
    "EXPORT_EMPTY":          "PEX02",
    "NO_PLAYABLE_TRACKS":    "PUP01",
})

TRACK = _Section("TRACK", "T", {
    "NOT_FOUND":     "TNF01",
    "HISTORY_EMPTY": "TNF02",
    "INVALID_ID":    "TVA01",
    "SIGNAL_UNKNOWN": "TVA02",
    "LIKE_FAILED":   "TEX01",
    "PLAY_FAILED":   "TEX02",
})

DOWNLOAD = _Section("DOWNLOAD", "D", {
    "JOB_NOT_FOUND":          "DNF01",
    "INVALID_URL":            "DVA01",
    "URL_TOO_LONG":           "DVA02",
    "TARGET_REQUIRED":        "DVA03",
    "INVALID_TRACK_ID":       "DVA04",
    "INVALID_JOB_ID":         "DVA05",
    "INVALID_QUALITY":        "DVA06",
    "INVALID_FORMAT":         "DVA07",
    "INVALID_SPEED":          "DVA08",
    "INVALID_CONCURRENCY":    "DVA09",
    "INVALID_TRACK_LIST":     "DVA10",
    "JOB_ALREADY_RUNNING":    "DCN01",
    "DIR_REGISTERED":         "DCN02",
    "LIMIT_REACHED":          "DLM01",
    "DIR_REQUIRED":           "DFS01",
    "PATH_OUTSIDE":           "DFS02",
    "DIR_UNREADABLE":         "DFS03",
    "SPAWN_FAILED":           "DEN01",
    "ENGINE_MISSING":         "DEN02",
    "CONVERSION_UNAVAILABLE": "DEN03",
    "FAILED":                 "DEX01",  # the transfer itself failed
})

STREAM = _Section("STREAM", "S", {
    "NOT_FOUND_REMOTE_INVALID": "SNF01",
    "NOT_DOWNLOADED_LOCALLY":   "SNF02",
    "RANGE_INVALID":            "SVA01",
    "ARTWORK_HOST_DENIED":      "SVA02",
    "INVALID_TRACK_ID":         "SVA03",
    "NOT_SEEKABLE_YET":         "SEX01",
    "WARMUP_FAILED":            "SEX02",
    "TOO_MANY_STREAMS":         "SLM01",
    "NOT_AVAILABLE":            "SUP01",
    "UPSTREAM_REFUSED":         "SUP02",
    "FAILURE_CACHED":           "SUP03",
    "ARTWORK_FAILED":           "SUP04",
})

SEARCH = _Section("SEARCH", "R", {
    "LYRICS_NOT_FOUND": "RNF01",
    "CATEGORY_UNKNOWN": "RNF02",
    "TARGET_REQUIRED":  "RVA01",
    "UNSUPPORTED_URL":  "RVA02",
    "LYRICS_INVALID":   "RVA03",
    "QUERY_EMPTY":      "RVA04",
    "RESOLVE_FAILED":   "RUP01",
})

LIBRARY = _Section("LIBRARY", "L", {
    "DIR_NOT_FOUND":             "LNF01",
    "ARTIST_NOT_FOUND":          "LNF02",
    "ALBUM_NOT_FOUND":           "LNF03",
    "ALBUM_FOR_TRACK_NOT_FOUND": "LNF04",
    "SCAN_INVALID":              "LVA01",
    "BACKUP_FILE_INVALID":       "LVA02",
    "SCAN_RUNNING":              "LCN01",
    "BACKUP_EXPORT_FAILED":      "LEX01",
    "BACKUP_RESTORE_FAILED":     "LEX02",
    "DIRS_PERSIST_FAILED":       "LEX03",
    "DB_UNAVAILABLE":            "LEN01",
})

SETTINGS = _Section("SETTINGS", "E", {   # sE = settings & preferences
    "PRESET_NOT_FOUND":        "ENF01",
    "UNKNOWN_KEY":             "EVA01",
    "VALUE_OUT_OF_RANGE":      "EVA02",
    "PRESET_INVALID":          "EVA03",
    "PRESET_NAME_REQUIRED":    "EVA04",
    "EQ_BANDS_INVALID":        "EVA05",
    "VISITOR_PAYLOAD_INVALID": "EVA06",
    "PREFS_INVALID":           "EVA07",
    "PREFS_DB_UNAVAILABLE":    "EEN01",
})

WEBHOOK = _Section("WEBHOOK", "W", {
    "SECRET_UNCONFIGURED": "WEN01",
    "HEADERS_MISSING":     "WVA01",
    "TIMESTAMP_EXPIRED":   "WVA02",
    "PAYLOAD_INVALID":     "WVA03",
    "USER_ID_MISSING":     "WVA04",
    "EVENT_UNSUPPORTED":   "WVA05",
    "SIGNATURE_INVALID":   "WCF01",
})

ARTIST = _Section("ARTIST", "F", {       # F = artist follows
    "INVALID_ID":            "FVA01",
    "ONBOARD_LIST_REQUIRED": "FVA02",
    "ONBOARD_NAME_REQUIRED": "FVA03",
    "FOLLOW_FAILED":         "FEX01",
})

PLAYBACK = _Section("PLAYBACK", "Y", {   # plaYback: equalizer family
    "EQ_UNSUPPORTED": "YEN01",
})

#: code → human message. Written to be shown; a router may append dynamic
#: values via ``fail(..., append=f": {value}")`` without touching the code.
_REGISTRY: dict[str, str] = {
    # ── Auth ──────────────────────────────────────────────────
    "ASE01": "Not signed in",
    "ASE02": "Session expired or invalid",
    "ACF01": "You don't have access to this",

    # ── Playlists ─────────────────────────────────────────────
    "PNF01": "Playlist not found",
    "PNF02": "Track not found in playlist",
    "PCN01": "Playlist already exists",
    "PCN02": "Track is already in this playlist",
    "PCF01": "Cannot modify a smart playlist here",
    "PVA01": "Playlist name is required",
    "PVA02": "Playlist name is too long",
    "PVA03": "Invalid track list",
    "PVA04": "Invalid playlist id",
    "PVA05": "A URL is required",
    "PVA06": "A playlist is required",
    "PVA07": "Reorder list must match the playlist's tracks",
    "PVA08": "Smart playlist rule is invalid",
    "PVA09": "A track id is required",
    "PEX01": "Import failed — the file could not be read",
    "PEX02": "Export failed — playlist is empty",
    "PUP01": "No playable tracks found at that URL",

    # ── Tracks / likes / history ──────────────────────────────
    "TNF01": "Track not found",
    "TNF02": "History is empty",
    "TVA01": "Invalid track id",
    "TVA02": "Unknown listening signal",
    "TEX01": "Could not update the like",
    "TEX02": "Could not record the play",

    # ── Downloads ─────────────────────────────────────────────
    "DNF01": "Download job not found",
    "DVA01": "Invalid URL format",
    "DVA02": "URL too long",
    "DVA03": "Track id or URL is required",
    "DVA04": "Invalid track id",
    "DVA05": "Invalid job id",
    "DVA06": "Invalid quality",
    "DVA07": "Invalid format",
    "DVA08": "Invalid speed limit",
    "DVA09": "Invalid concurrency",
    "DVA10": "No tracks were given",
    "DCN01": "That download is already running",
    "DCN02": "Directory already registered",
    "DLM01": "Download limit reached — try again shortly",
    "DFS01": "A music directory is required",
    "DFS02": "Path is outside the configured music directories",
    "DFS03": "Could not read the directory",
    "DEN01": "The download could not start on this server",
    "DEN02": "The download engine is not installed on this server",
    "DEN03": "Audio conversion is unavailable on this server",
    "DEX01": "Download failed",

    # ── Streaming ─────────────────────────────────────────────
    "SNF01": "Track not found locally and the id is not a valid remote track",
    "SNF02": "Not downloaded locally",
    "SVA01": "Range not satisfiable",
    "SVA02": "Artwork host is not allowed",
    "SVA03": "Invalid track id",
    "SEX01": "Stream not ready for seeking yet",
    "SEX02": "Stream warm-up failed",
    "SLM01": "Too many concurrent streams, try again shortly",
    "SUP01": "Track not available",
    "SUP02": "Could not stream this track. YouTube may be rate-limiting",
    "SUP03": "Track temporarily unavailable (recent failure cached)",
    "SUP04": "Could not fetch the artwork",

    # ── Search / resolve ──────────────────────────────────────
    "RNF01": "No lyrics found for this track",
    "RNF02": "Unknown trending category",
    "RVA01": "Track id or URL is required",
    "RVA02": "Unsupported or unresolvable URL",
    "RVA03": "Invalid lyrics request",
    "RVA04": "The search query cannot be empty",
    "RUP01": "Could not look up this track right now",

    # ── Library / dirs / backups ──────────────────────────────
    "LNF01": "Directory not found",
    "LNF02": "Artist not found",
    "LNF03": "Album not found",
    "LNF04": "Album not found for this track",
    "LVA01": "Invalid scan options",
    "LVA02": "Backup file is invalid",
    "LCN01": "Scan is already running",
    "LEX01": "Backup export failed",
    "LEX02": "Backup restore failed",
    "LEX03": "Could not persist the music directories",
    "LEN01": "Database not available",

    # ── Settings / preferences ────────────────────────────────
    "ENF01": "Preset not found",
    "EVA01": "Unknown setting",
    "EVA02": "Value out of range for this setting",
    "EVA03": "Invalid preset",
    "EVA04": "Preset name is required",
    "EVA05": "Invalid equalizer bands",
    "EVA06": "Invalid visitor counter payload",
    "EVA07": "Invalid preferences payload",
    "EEN01": "Preference sync needs the database. Your settings still work",

    # ── Webhooks ──────────────────────────────────────────────
    "WEN01": "Webhook secret not configured",
    "WVA01": "Missing webhook headers",
    "WVA02": "Webhook timestamp expired",
    "WVA03": "Invalid webhook payload",
    "WVA04": "Webhook user is missing an id",
    "WVA05": "Webhook event type is not supported",
    "WCF01": "Invalid webhook signature",

    # ── Artists / follows ─────────────────────────────────────
    "FVA01": "Invalid artist id",
    "FVA02": "Provide a list of artist names",
    "FVA03": "Provide at least one artist name",
    "FEX01": "Artist follow could not be saved",

    # ── Playback / equalizer ──────────────────────────────────
    "YEN01": "Equalizer is not supported on this device",
}


def message_for(code: str) -> str:
    """Registered message for a code (raises KeyError for an unknown code)."""
    return _REGISTRY[code]


def all_codes() -> dict[str, str]:
    """The full registry — for tests and the docs generator."""
    return dict(_REGISTRY)


def fail(
    code: str,
    status: int = 400,
    *,
    append: str = "",
    headers: dict[str, str] | None = None,
) -> HTTPException:
    """Build the HTTPException for a registered DCCNN code.

    ``fail(DOWNLOAD.FAILED, 500)`` reads at the raise site, and the response
    carries ``{"detail": "Download failed [ERR DEX01]", "code": "DEX01"}``.
    The bracketed suffix is the machine-readable part; the message stays
    human copy. The code must be registered — an unregistered code raises
    here rather than leaking an untraceable error to a user.
    """
    if not CODE_RE.match(code or ""):
        raise AssertionError(f"malformed error code {code!r} (want DCCNN)")
    try:
        msg = _REGISTRY[code]
    except KeyError as e:
        raise AssertionError(f"error code {code} is not registered") from e
    detail = f"{msg}{append}" if append else msg
    exc = HTTPException(
        status_code=status,
        detail=f"{detail} [ERR {code}]",
        headers=headers,
    )
    # Read back by the response handler and emitted as the structured
    # ``code`` field; HTTPException allows arbitrary attributes.
    exc.error_code = code  # type: ignore[attr-defined]
    return exc
