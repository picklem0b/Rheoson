"""MongoDB async connection layer using Motor.

The connection is established during app startup via connect_db().
If MongoDB is unreachable the app still starts — file-based features
(tracks, playlists, downloads, streaming) keep working. Only auth,
recommendations, analytics, and visitor counting require the database.
"""

from __future__ import annotations

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.core.config import settings

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None
_connected: bool = False


async def connect_db() -> None:
    """Create the Motor client and verify connectivity.

    Non-blocking: uses a short timeout so the app starts even when
    MongoDB is down. All DB-dependent routes return 503 gracefully.
    """
    global _client, _db, _connected

    import structlog
    log = structlog.get_logger()

    try:
        # Use a bounded timeout so an unavailable database never prevents
        # the API from starting, while allowing Atlas enough time for
        # replica-set discovery on slower networks.
        _client = AsyncIOMotorClient(
            settings.MONGODB_URL,
            serverSelectionTimeoutMS=15000,
            connectTimeoutMS=10000,
            socketTimeoutMS=10000,
        )
        _db = _client[settings.MONGODB_DB_NAME]

        # Eagerly ping — fail fast
        await _client.admin.command("ping")
        _connected = True

        # Create indexes for common query patterns.
        await _db.users.create_index("email", unique=True)
        await _db.playlists.create_index("user_id")
        await _db.liked_tracks.create_index("user_id")
        await _db.listening_history.create_index("user_id")
        await _db.visitors.create_index("_id")

        # Recommendation indexes
        await _db.user_signals.create_index([("user_id", 1), ("timestamp", -1)])
        await _db.user_signals.create_index([("user_id", 1), ("signal", 1), ("timestamp", -1)])
        await _db.user_signals.create_index([("user_id", 1), ("artist", 1)])
        await _db.user_signals.create_index([("user_id", 1), ("track_id", 1)])
        await _db.taste_profiles.create_index("user_id", unique=True)
        await _db.user_recommendations.create_index("user_id", unique=True)

        log.info("db.connected", url=settings.MONGODB_URL.split("@")[-1] if "@" in settings.MONGODB_URL else settings.MONGODB_URL)

    except Exception as e:
        _connected = False
        log.warning(
            "db.unavailable",
            error=str(e)[:200],
            note="Running without database — file-based features still work",
        )
        # Close the client to stop the background reconnect loop
        if _client:
            _client.close()
        _client = None
        _db = None


async def close_db() -> None:
    """Close the Motor client gracefully."""
    global _client, _db, _connected
    if _client:
        _client.close()
    _client = None
    _db = None
    _connected = False


def get_db() -> AsyncIOMotorDatabase:
    """Return the active database or raise 503 if MongoDB is unavailable.

    Used as a FastAPI dependency — endpoints that require the database
    will automatically return 503 instead of crashing when MongoDB
    isn't running.
    """
    if _db is None:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=503,
            detail="MongoDB is not available. Start MongoDB or configure MONGODB_URL.",
        )
    return _db


def db_available() -> bool:
    """Check if the database connection is active.

    RHEOSON_MOCK_DB=1 (set by the test suite) treats the injected mock
    database as available. That keeps per-user data (likes, history,
    playlists) isolated per test — the mock is recreated for every fixture
    — instead of leaking through the real MUSIC_DIR file mirrors, which
    live at a single per-session temp path shared by all tests.
    """
    import os as _os
    if _os.environ.get("RHEOSON_MOCK_DB") == "1":
        return True
    return _db is not None and _connected
