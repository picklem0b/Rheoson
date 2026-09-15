"""Per-user device-independent preferences.

Everything else this app stores per user is server-side (likes, history,
playlists, follows) — but the settings that shape the experience itself lived
only in the browser's localStorage. Reinstall the APK, open the web player on
another machine, or clear site data, and every one of those choices reset to
defaults. That split also made "your settings" a lie on a shared instance:
they were per-browser, not per-account.

A small whitelist is stored alongside the Clerk profile and merged over the
client's local values at boot. Local-first remains the source of truth while
the tab is open — the server copy exists so the same person lands in the same
app everywhere they sign in.

Unknown keys are dropped on write and on read. The client ships many
localStorage keys, including ones for features that were removed; treating
localStorage as trusted input would let a stale or hand-edited payload decide
what the server stores.
"""

from __future__ import annotations

from typing import Any

import structlog

log = structlog.get_logger()

# The syncable set is deliberately narrow: keys whose behaviour is shared
# across devices and meaningless without an account behind them. Device-local
# concerns (cache size, download paths) stay device-local.
DEFAULTS: dict[str, Any] = {
    "autoplay": True,
    "normalize": True,
    "bass-boost": False,
    "mono": False,
    "pre-amp-gain": 0,
    "eq-preset": "Flat",
    "notif-sound": True,
    "notif-dl-done": True,
    "save-history": True,
    "save-search-log": True,
    "theme-accent": "crimson",
    "theme-surface": "dark",
    "glass-opacity": 0.7,
    "nav-style": "pill",
    "nav-position": "bottom",
}

_TYPES: dict[str, tuple[type, ...]] = {
    "autoplay": (bool,),
    "normalize": (bool,),
    "bass-boost": (bool,),
    "mono": (bool,),
    "pre-amp-gain": (int, float),
    "eq-preset": (str,),
    "notif-sound": (bool,),
    "notif-dl-done": (bool,),
    "save-history": (bool,),
    "save-search-log": (bool,),
    "theme-accent": (str,),
    "theme-surface": (str,),
    "glass-opacity": (int, float),
    "nav-style": (str,),
    "nav-position": (str,),
}

_MAX_PRE_AMP = 24.0
_MAX_GLASS = 1.0
_MAX_ENUM_LEN = 32


def sanitize(raw: Any) -> dict[str, Any]:
    """Keep only whitelisted keys whose values have the right type and range.

    Never raises — a malformed payload becomes an empty patch, which the
    caller surfaces as a 400 rather than storing junk.
    """
    if not isinstance(raw, dict):
        return {}
    out: dict[str, Any] = {}
    for key, value in raw.items():
        if key not in DEFAULTS:
            continue
        if not isinstance(value, _TYPES[key]):
            # bool is a subclass of int — reject bools where a number belongs.
            if isinstance(value, bool) and int not in _TYPES[key]:
                continue
            continue
        if key == "pre-amp-gain":
            value = max(-_MAX_PRE_AMP, min(_MAX_PRE_AMP, float(value)))
        elif key == "glass-opacity":
            value = max(0.0, min(_MAX_GLASS, float(value)))
        elif isinstance(value, str):
            if len(value) > _MAX_ENUM_LEN:
                continue
        out[key] = value
    return out


async def get_preferences(db, user_id: str) -> dict[str, Any]:
    """The user's stored preferences, with defaults filled in."""
    prefs: dict[str, Any] = dict(DEFAULTS)
    if db is not None:
        try:
            doc = await db.users.find_one({"_id": user_id}, {"preferences": 1})
            stored = (doc or {}).get("preferences")
            if isinstance(stored, dict):
                prefs.update(sanitize(stored))
        except Exception:
            log.warning("prefs.read_failed", user_id=user_id[:8], exc_info=True)
    return prefs


async def update_preferences(db, user_id: str, patch: dict) -> dict[str, Any]:
    """Merge a validated patch into the stored preferences. Returns the result."""
    clean = sanitize(patch)
    if not clean:
        return await get_preferences(db, user_id)
    try:
        # Field-path $set so a patch of two keys never races a whole-document
        # overwrite — and so unknown keys already stored are preserved.
        # Upsert: users who only ever log in (no register-time doc) still get
        # a place to keep preferences; a real update_one would no-op silently.
        await db.users.update_one(
            {"_id": user_id},
            {"$set": {f"preferences.{k}": v for k, v in clean.items()}},
            upsert=True,
        )
    except Exception:
        log.warning("prefs.write_failed", user_id=user_id[:8], exc_info=True)
    return await get_preferences(db, user_id)
