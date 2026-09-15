"""Tests for the backup/restore bundle.

These are the tests that matter most for a feature nobody exercises until they
have lost something. The property under test is not "does it 200" but "does a
restore ever destroy something the user did after their last export".
"""

from __future__ import annotations

import pytest

TRACK_A = "dQw4w9WgXcQ"
TRACK_B = "9bZkp7q19f0"
ARTIST = "UCuAXFkgsw1L7xaCfnd5JJOw"


async def _seed(client) -> None:
    """Like, play, playlist and follow — one of every stored section."""
    await client.post(f"/api/tracks/{TRACK_A}/like")
    await client.post(f"/api/tracks/{TRACK_A}/play")
    await client.post(
        "/api/playlists",
        json={"title": "Road trip", "description": "for the car", "tracks": []},
    )
    await client.post(f"/api/artists/{ARTIST}/follow", json={"name": "Rick Astley"})


async def _liked_ids(client) -> set[str]:
    """Liked-track ids, tolerating either response shape.

    `/tracks/liked` returns a bare array of hydrated tracks.
    """
    res = await client.get("/api/tracks/liked")
    data = res.json()
    items = data["tracks"] if isinstance(data, dict) else data
    return {
        str(t["id"])
        for t in (items or [])
        if isinstance(t, dict) and t.get("id")
    }


@pytest.mark.asyncio
async def test_export_contains_every_stored_section(client):
    await _seed(client)

    res = await client.get("/api/settings/backup")
    assert res.status_code == 200
    bundle = res.json()

    assert bundle["format"] == "rheoson-backup"
    assert bundle["version"] >= 1
    assert bundle["exportedAt"]
    assert TRACK_A in bundle["liked"]
    assert any(e.get("id") == TRACK_A for e in bundle["history"])
    assert len(bundle["playlists"]) == 1
    assert any(f.get("id") == ARTIST for f in bundle["follows"])


@pytest.mark.asyncio
async def test_round_trip_restores_onto_an_empty_account(client, client_as_other_user):
    await _seed(client)
    bundle = (await client.get("/api/settings/backup")).json()

    res = await client_as_other_user.post("/api/settings/restore", json=bundle)
    assert res.status_code == 200
    counts = res.json()
    assert counts["liked"] >= 1
    assert counts["playlists"] >= 1
    assert counts["follows"] >= 1

    # The second account now sees the restored state through the real endpoints.
    liked = await client_as_other_user.get("/api/tracks/liked")
    assert liked.status_code == 200
    following = await client_as_other_user.get("/api/artists/following")
    assert any(f["id"] == ARTIST for f in following.json()["artists"])


@pytest.mark.asyncio
async def test_merge_never_deletes_activity_newer_than_the_backup(client):
    await _seed(client)
    bundle = (await client.get("/api/settings/backup")).json()

    # The user keeps using the app after exporting.
    await client.post(f"/api/tracks/{TRACK_B}/like")

    res = await client.post("/api/settings/restore", json={**bundle, "merge": True})
    assert res.status_code == 200

    ids = await _liked_ids(client)
    # Both the exported like and the one made afterwards survive.
    assert TRACK_A in ids
    assert TRACK_B in ids


@pytest.mark.asyncio
async def test_replace_mode_discards_state_outside_the_backup(client):
    await _seed(client)
    bundle = (await client.get("/api/settings/backup")).json()

    await client.post(f"/api/tracks/{TRACK_B}/like")

    res = await client.post("/api/settings/restore", json={**bundle, "merge": False})
    assert res.status_code == 200

    ids = await _liked_ids(client)
    assert TRACK_A in ids
    assert TRACK_B not in ids


@pytest.mark.asyncio
async def test_foreign_and_newer_bundles_are_refused(client):
    foreign = await client.post(
        "/api/settings/restore", json={"format": "some-other-app", "liked": [TRACK_A]}
    )
    assert foreign.status_code == 400

    newer = await client.post(
        "/api/settings/restore", json={"format": "rheoson-backup", "version": 9999}
    )
    assert newer.status_code == 400

    # A refusal must not have partially applied anything.
    assert TRACK_A not in await _liked_ids(client)


@pytest.mark.asyncio
async def test_restore_is_scoped_to_the_calling_user(client, client_as_other_user):
    await _seed(client)
    bundle = (await client.get("/api/settings/backup")).json()

    # The other account restores with replace — the first account is untouched.
    await client_as_other_user.post(
        "/api/settings/restore", json={**bundle, "merge": False}
    )

    assert TRACK_A in await _liked_ids(client)


@pytest.mark.asyncio
async def test_structurally_invalid_bundles_are_rejected_before_any_write(client):
    """A bundle that is not even the right shape must not be half-applied."""
    res = await client.post(
        "/api/settings/restore",
        json={
            "format": "rheoson-backup",
            "version": 1,
            "liked": [TRACK_A],
            "history": ["not-an-object", None],
        },
    )
    assert res.status_code == 422
    # The valid `liked` section alongside the invalid one was not applied.
    assert TRACK_A not in await _liked_ids(client)


@pytest.mark.asyncio
async def test_history_entries_without_an_id_are_dropped_not_stored(client):
    """Valid JSON with a missing id is the shape a hand-edited file has."""
    res = await client.post(
        "/api/settings/restore",
        json={
            "format": "rheoson-backup",
            "version": 1,
            "history": [
                {"id": TRACK_A, "playedAt": "2026-01-01T00:00:00+00:00"},
                {"playedAt": "2026-01-02T00:00:00+00:00"},  # no id
                {"id": "", "playedAt": "2026-01-03T00:00:00+00:00"},  # blank id
            ],
        },
    )
    assert res.status_code == 200
    assert res.json()["history"] == 1

    history = (await client.get("/api/tracks/recently-played")).json()
    assert isinstance(history, list)
    assert all(e.get("id") for e in history if isinstance(e, dict))
