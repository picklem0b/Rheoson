"""Shared fixtures for Rheoson API tests."""

from __future__ import annotations

import os
import tempfile
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, MagicMock, patch

# ── Isolate every test run from the dev machine's real music library ──
_test_base = tempfile.mkdtemp(prefix="rheoson-api-test-")
os.environ["MUSIC_DIR"] = os.path.join(_test_base, "music")
os.environ["DOWNLOADS_DIR"] = os.path.join(_test_base, "downloads")
os.environ["EXTRA_MUSIC_DIRS"] = "[]"
os.environ.setdefault(
    "MONGODB_URL", "mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=300"
)
os.environ.pop("RHEOSON_MOCK_DB", None)
# Rate limits are per-IP but all tests share the same ASGI transport IP.
# Set them very high so they never trigger during tests.
os.environ["RATE_LIMIT_SEARCH"] = "99999"
os.environ["RATE_LIMIT_DOWNLOAD"] = "99999"


# ── Mock database ──────────────────────────────────────────────

class MockCollection:
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


# ── Token → claims registry ───────────────────────────────────
# Multiple fixtures with different identities coexist in one test.
# A single patched verify_clerk_token decodes the Bearer token to
# look up the right claims.

_token_registry: dict[str, dict] = {}

async def _fake_verify(token: str) -> dict | None:
    return _token_registry.get(token)


TEST_USER_SUB = "user_test_123"
_OTHER_SUB = "user_other_456"
_USER_TOKEN = f"fake-token-{TEST_USER_SUB}"
_OTHER_TOKEN = f"fake-token-{_OTHER_SUB}"

_BASE_CLAIMS = {
    "sid": "sess_test_abc",
    "email_address": "test@rheoson.test",
    "first_name": "Testy",
    "iss": "https://glad-tuna-9004.clerk.accounts.dev",
}
_token_registry[_USER_TOKEN] = {**_BASE_CLAIMS, "sub": TEST_USER_SUB}
_token_registry[_OTHER_TOKEN] = {**_BASE_CLAIMS, "sub": _OTHER_SUB}


# ── Build the FastAPI app ONCE with permanent patches ──────────
# Using patch.start() so the patches survive past the with-block.

_shared_mock_db = MockDatabase()
_patches = [
    patch("app.core.database.get_db", return_value=_shared_mock_db),
    patch("app.core.database.connect_db", new_callable=AsyncMock),
    patch("app.core.database.close_db", new_callable=AsyncMock),
    patch("app.core.deps.verify_clerk_token", side_effect=_fake_verify),
]
for p in _patches:
    p.start()

import importlib as _il
import app.main as _main_module
_il.reload(_main_module)
from app.main import app as _shared_app  # noqa: E402


# ── Auth fixtures ─────────────────────────────────────────────

def _auth_hook(token: str):
    async def _hook(request):
        if "authorization" not in request.headers:
            request.headers["authorization"] = f"Bearer {token}"
    return _hook


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=_shared_app),
        base_url="http://test",
        follow_redirects=True,
        event_hooks={"request": [_auth_hook(_USER_TOKEN)]},
    ) as ac:
        yield ac


@pytest_asyncio.fixture
async def client_anon():
    async with AsyncClient(
        transport=ASGITransport(app=_shared_app),
        base_url="http://test",
        follow_redirects=True,
    ) as ac:
        yield ac


@pytest_asyncio.fixture
async def client_as_other_user():
    async with AsyncClient(
        transport=ASGITransport(app=_shared_app),
        base_url="http://test",
        follow_redirects=True,
        event_hooks={"request": [_auth_hook(_OTHER_TOKEN)]},
    ) as ac:
        yield ac


# ── Per-test filesystem cleanup ──────────────────────────────────
# File-backed stores (.liked-*.json, .history-*.json, .playlists-*.json)
# live in MUSIC_DIR.  Without cleanup, state leaks between tests.

@pytest.fixture(autouse=True)
def _clean_state():
    """Reset file-backed stores and rate limiter between tests."""
    import glob as _glob
    music = os.environ["MUSIC_DIR"]
    for pattern in (".liked-*.json", ".history-*.json", ".playlists-*.json"):
        for f in _glob.glob(os.path.join(music, pattern)):
            os.unlink(f)
    yield
    for pattern in (".liked-*.json", ".history-*.json", ".playlists-*.json"):
        for f in _glob.glob(os.path.join(music, pattern)):
            os.unlink(f)


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
