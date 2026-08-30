"""MongoDB async connection layer using Motor."""

from __future__ import annotations

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.core.config import settings

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


async def connect_db() -> None:
    """Create the Motor client and verify connectivity."""
    global _client, _db
    _client = AsyncIOMotorClient(settings.MONGODB_URL)
    _db = _client[settings.MONGODB_DB_NAME]
    # Eagerly ping to fail fast on bad credentials / unreachable host.
    await _client.admin.command("ping")
    # Create indexes for common query patterns.
    await _db.users.create_index("email", unique=True)
    await _db.playlists.create_index("user_id")
    await _db.liked_tracks.create_index("user_id")
    await _db.listening_history.create_index("user_id")


async def close_db() -> None:
    """Close the Motor client gracefully."""
    global _client, _db
    if _client:
        _client.close()
    _client = None
    _db = None


def get_db() -> AsyncIOMotorDatabase:
    """Return the active database (must call *connect_db* first)."""
    if _db is None:
        raise RuntimeError("Database not initialised — call connect_db() first")
    return _db
