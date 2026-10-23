"""Lyrics come from the `.lrc` a download left beside the audio.

A downloaded track already has its lyrics on disk. Asking a provider first
shows different words for a track the user owns, and with no connection it
shows none at all — so the sidecar wins whenever one exists.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from app.routers import stream_router
from app.services import lyrics_service
from app.services.metadata_service import _file_id


@pytest.fixture(autouse=True)
def _fresh_index():
    """The local-file index is built lazily and cached for the process."""
    stream_router.invalidate_stream_cache()
    yield
    stream_router.invalidate_stream_cache()


@pytest.fixture
def audio_file():
    music = Path(os.environ["MUSIC_DIR"])
    path = music / "Sidecar Artist" / "Sidecar Song.m4a"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"\x00\x00")
    yield path
    path.unlink(missing_ok=True)
    for suffix in (".lrc", ".LRC"):
        path.with_suffix(suffix).unlink(missing_ok=True)


def _no_provider(*_args, **_kwargs):
    raise AssertionError("the provider must not be asked when a sidecar exists")


@pytest.mark.asyncio
async def test_timed_sidecar_wins_over_the_provider(client, audio_file, monkeypatch):
    audio_file.with_suffix(".lrc").write_text(
        "[00:12.34] first line\n[00:15.00] second line\n", encoding="utf-8"
    )
    monkeypatch.setattr(lyrics_service, "_fetch_synced", _no_provider)
    monkeypatch.setattr(lyrics_service, "_fetch_plain", _no_provider)

    response = await client.get(f"/api/lyrics/{_file_id(audio_file)}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["synced"] is True
    assert payload["source"] == "sidecar"
    assert [line["text"] for line in payload["lines"]] == ["first line", "second line"]
    # Milliseconds, matching LyricsLineSchema.
    assert payload["lines"][0]["time"] == 12340.0


@pytest.mark.asyncio
async def test_untimed_sidecar_is_returned_as_plain_text(client, audio_file, monkeypatch):
    audio_file.with_suffix(".lrc").write_text("just words\nmore words\n", encoding="utf-8")
    monkeypatch.setattr(lyrics_service, "_fetch_synced", _no_provider)
    monkeypatch.setattr(lyrics_service, "_fetch_plain", _no_provider)

    payload = (await client.get(f"/api/lyrics/{_file_id(audio_file)}")).json()

    assert payload["synced"] is False
    assert payload["source"] == "sidecar"
    assert [line["text"] for line in payload["lines"]] == ["just words", "more words"]


@pytest.mark.asyncio
async def test_provider_is_used_when_no_sidecar_exists(client, audio_file, monkeypatch):
    monkeypatch.setattr(
        lyrics_service, "_fetch_synced", lambda _query: "[00:01.00] from provider\n"
    )

    payload = (await client.get(f"/api/lyrics/{_file_id(audio_file)}")).json()

    assert payload["source"] == "syncedlyrics"
    assert [line["text"] for line in payload["lines"]] == ["from provider"]


@pytest.mark.asyncio
async def test_unknown_track_returns_empty_not_an_error(client, monkeypatch):
    monkeypatch.setattr(lyrics_service, "_fetch_synced", lambda _query: None)
    monkeypatch.setattr(lyrics_service, "_fetch_plain", lambda _query: None)

    response = await client.get("/api/lyrics/0123456789abcdef")

    assert response.status_code == 200
    assert response.json()["lines"] == []
