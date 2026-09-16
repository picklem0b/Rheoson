"""Durable warm-stream cache tests.

The warm cache is what makes a replayed track start instantly even after
a server restart. These tests pin the three behaviors that matter:
promotion after a fill, lookup across "restarts" (fresh module state),
and LRU eviction within the byte budget.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.routers import stream_router


@pytest.fixture()
def warm_env(tmp_path, monkeypatch):
    """Point the warm cache at a private tmp dir with a tiny budget."""
    d = tmp_path / "stream-cache"
    d.mkdir()
    monkeypatch.setattr(stream_router.settings, "STREAM_CACHE_DIR", str(d))
    monkeypatch.setattr(stream_router.settings, "STREAM_CACHE_MAX_MB", 1)
    return d


def _fake_audio(path: Path, size: int = 4096) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"\xff\xfb" + b"\x00" * (size - 2))


def test_promote_then_lookup_across_restart(warm_env, monkeypatch):
    # Simulate a completed session buffer being promoted.
    src = warm_env.parent / "buffer" / "dQw4w9WgXcQ.audio"
    _fake_audio(src)
    stream_router._warm_promote("dQw4w9WgXcQ", src, "audio/mp4")

    # In-memory caches are wiped (restart) — the durable file remains.
    stream_router._remote_cache.clear()
    found = stream_router._warm_lookup("dQw4w9WgXcQ")
    assert found is not None
    assert found.read_bytes().startswith(b"\xff\xfb")
    assert stream_router._warm_mime("dQw4w9WgXcQ") == "audio/mp4"


def test_lookup_rejects_tiny_garbage(warm_env):
    f = warm_env / "AAAAAAAAAAA.audio"
    f.write_bytes(b"x" * 100)  # below the 1 KB sanity floor
    assert stream_router._warm_lookup("AAAAAAAAAAA") is None


def test_lru_eviction_respects_budget(warm_env):
    # Budget is 1 MB; write ~700 KB then ~700 KB more → first file evicted.
    big = warm_env.parent / "buffer" / "big.audio"
    _fake_audio(big, size=700 * 1024)
    stream_router._warm_promote("11111111111", big, None)
    import time

    time.sleep(0.02)
    _fake_audio(big, size=700 * 1024)
    big.write_bytes(b"\xff\xfb" + b"\x00" * (700 * 1024 - 2))
    stream_router._warm_promote("22222222222", big, None)

    stream_router._warm_enforce_limit()
    assert stream_router._warm_lookup("11111111111") is None
    assert stream_router._warm_lookup("22222222222") is not None


def test_promote_without_dir_is_noop(monkeypatch, tmp_path):
    monkeypatch.setattr(stream_router.settings, "STREAM_CACHE_DIR", "")
    src = tmp_path / "x.audio"
    _fake_audio(src)
    # Must not raise.
    stream_router._warm_promote("dQw4w9WgXcQ", src, None)


@pytest.mark.asyncio
async def test_warm_endpoint_reports_warmed_state(warm_env, client):
    # Stage a warm file for a YouTube-shaped id, then hit the endpoint.
    f = warm_env / "dQw4w9WgXcQ.audio"
    f.write_bytes(b"\xff\xfb" + b"\x00" * 4096)

    resp = await client.post("/api/stream/dQw4w9WgXcQ/warm")
    assert resp.status_code == 200
    assert resp.json()["state"] == "warmed"
