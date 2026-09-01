"""Shared fixtures for Rheoson API tests."""

from __future__ import annotations

import asyncio
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, MagicMock, patch


# ── Mock database ──────────────────────────────────────────────

class MockCollection:
    """In-memory mock of a MongoDB collection."""

    def __init__(self):
        self._docs: list[dict] = []

    async def find_one(self, filter: dict, sort=None):
        for doc in self._docs:
            if all(doc.get(k) == v for k, v in filter.items()):
                return dict(doc)
        return None

    async def find(self, filter: dict, sort=None):
        class Cursor:
            def __init__(self, docs):
                self._docs = docs
            def sort(self, *args):
                return self
            def limit(self, n):
                self._docs = self._docs[:n]
                return self
            async def to_list(self, length=None):
                return self._docs
            def __aiter__(self):
                return iter(self._docs)
        matches = [dict(d) for d in self._docs if all(d.get(k) == v for k, v in filter.items())]
        return Cursor(matches)

    async def insert_one(self, doc):
        self._docs.append(dict(doc))
        result = MagicMock()
        result.inserted_id = doc.get("_id", "mock_id")
        return result

    async def update_one(self, filter, update, upsert=False):
        for doc in self._docs:
            if all(doc.get(k) == v for k, v in filter.items()):
                if "$set" in update:
                    doc.update(update["$set"])
                return MagicMock()
        if upsert and "$set" in update:
            new_doc = {**filter, **update["$set"]}
            self._docs.append(new_doc)
        return MagicMock()

    async def delete_one(self, filter):
        self._docs = [d for d in self._docs if not all(d.get(k) == v for k, v in filter.items())]
        return MagicMock()

    async def count_documents(self, filter):
        return sum(1 for d in self._docs if all(d.get(k) == v for k, v in filter.items()))

    async def aggregate(self, pipeline):
        return iter([])


class MockDatabase:
    """In-memory mock of a MongoDB database."""

    def __init__(self):
        self._collections: dict[str, MockCollection] = {}

    def __getattr__(self, name: str) -> MockCollection:
        if name not in self._collections:
            self._collections[name] = MockCollection()
        return self._collections[name]

    def __getitem__(self, name: str) -> MockCollection:
        return getattr(self, name)


@pytest.fixture
def mock_db():
    return MockDatabase()


# ── FastAPI test client ────────────────────────────────────────

@pytest_asyncio.fixture
async def client():
    """Async test client with mocked database."""
    mock_db = MockDatabase()

    # Patch database before importing the app
    with patch("app.core.database.get_db", return_value=mock_db), \
         patch("app.core.database.connect_db", new_callable=AsyncMock), \
         patch("app.core.database.close_db", new_callable=AsyncMock):

        # Force reimport to pick up patches
        import importlib
        import app.main as main_module
        importlib.reload(main_module)

        from app.main import app

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac


# ── Common test data ───────────────────────────────────────────

@pytest.fixture
def sample_track():
    return {
        "id": "dQw4w9WgXcQ",
        "title": "Never Gonna Give You Up",
        "artist": {"id": "UCuAXFkgsw1L7xaCfnd5JJOw", "name": "Rick Astley", "imageUrl": "", "genres": []},
        "album": {"id": "", "title": "", "artworkUrl": "", "releaseYear": 0, "trackCount": 0, "artist": {"id": "", "name": "Rick Astley", "imageUrl": "", "genres": []}},
        "artworkUrl": "",
        "duration": 212.0,
        "streamUrl": "/api/stream/dQw4w9WgXcQ/audio",
        "isDownloaded": False,
        "isLiked": False,
        "youtubeId": "dQw4w9WgXcQ",
    }


@pytest.fixture
def sample_download_job():
    return {
        "id": "test-job-id",
        "trackId": "dQw4w9WgXcQ",
        "title": "Never Gonna Give You Up",
        "artist": "Rick Astley",
        "artworkUrl": "",
        "status": "done",
        "progress": 100.0,
        "format": "mp3",
        "quality": "320",
        "error": None,
        "filePath": "/tmp/music/Rick Astley/Never Gonna Give You Up.mp3",
        "createdAt": "2026-08-31T00:00:00",
    }
