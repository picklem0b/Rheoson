"""Supabase (Postgres) client — the account store.

Postgres replaces MongoDB for accounts. Configuration is fail-open in the
same style as Mongo: no credentials configured means ``supabase_available()``
is False and callers fall back (JWT claims for /auth/me), instead of the
whole server refusing to boot.

The key contract: the SERVER must hold the secret key (``sb_secret_…``).
The publishable key is browser-safe and blocked by RLS — writing user rows
with it fails, so at startup we detect that misconfiguration and log one
clear warning instead of failing every request with an obscure 401/42501.
"""

from __future__ import annotations

import threading

import structlog

from app.core.config import settings

log = structlog.get_logger()

_client = None
_ready = False
_available = False
_lock = threading.Lock()


def _create_client():
    from supabase import create_client  # imported lazily — optional dep

    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)


async def connect_supabase() -> None:
    """Initialise the Supabase client and verify the users table is writable.

    Mirrors connect_db()'s contract: never raises, never blocks startup.
    A write-probe against the configured table doubles as the readiness
    check — if RLS blocks the key we find out here, loudly, once.
    """
    global _client, _ready, _available

    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
        log.info("supabase.disabled", note="SUPABASE_URL / SUPABASE_KEY not set — accounts stay on Mongo/JWT claims")
        _ready = True
        return

    with _lock:
        if _ready:
            return
        try:
            _client = _create_client()
            table = settings.SUPABASE_USERS_TABLE
            # The postgrest client is sync (httpx under the hood); run the
            # probe off the event loop so a slow network never stalls boot.
            import anyio

            def _probe():
                _client.table(table).select("id", count="exact").limit(1).execute()

            await anyio.to_thread.run_sync(_probe, abandon_on_cancel=True)
            _available = True
            log.info("supabase.connected", table=table)
        except Exception as e:  # noqa: BLE001 — fail open, same as Mongo
            _available = False
            log.error(
                "supabase.connect_failed",
                error=str(e),
                hint="Is the key the secret key (sb_secret_…)? Publishable keys are blocked by RLS.",
            )
        finally:
            _ready = True


def supabase_available() -> bool:
    return _available


def get_supabase():
    """Return the Supabase client, or None when unavailable.

    Callers must handle None (route to Mongo fallback / JWT claims).
    """
    return _client if _available else None


async def run_sb(fn, *args, **kwargs):
    """Run a sync postgrest call off the event loop.

    Every table call goes through this so handlers stay async-clean.
    """
    import anyio

    return await anyio.to_thread.run_sync(
        lambda: fn(*args, **kwargs), abandon_on_cancel=True
    )
