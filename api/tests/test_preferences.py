"""Preference sync endpoints.

Storage is a MongoDB document per Clerk user (the test suite's mock DB). These
tests pin the parts that are easy to get subtly wrong: the whitelist, the type
validation, the defaults, and the fact that one user's write is invisible to
another.
"""

from __future__ import annotations

import pytest

BASE = "/api/auth"


@pytest.mark.asyncio
async def test_get_returns_defaults_for_a_new_user(client):
    res = await client.get(f"{BASE}/me/preferences")
    assert res.status_code == 200
    body = res.json()
    assert body["synced"] is True
    prefs = body["preferences"]
    assert prefs["autoplay"] is True
    assert prefs["normalize"] is True
    assert prefs["theme-accent"] == "crimson"
    # Nothing outside the whitelist ever appears, even as a default.
    assert "dl-custom-path" not in prefs
    assert "crossfade" not in prefs


@pytest.mark.asyncio
async def test_round_trip_and_merge(client):
    res = await client.put(
        f"{BASE}/me/preferences",
        json={"preferences": {"autoplay": False, "pre-amp-gain": -4}},
    )
    assert res.status_code == 200
    prefs = res.json()["preferences"]
    assert prefs["autoplay"] is False
    assert prefs["pre-amp-gain"] == -4
    # Keys not in the patch keep their previous values.
    assert prefs["normalize"] is True

    reread = await client.get(f"{BASE}/me/preferences")
    assert reread.json()["preferences"]["autoplay"] is False


@pytest.mark.asyncio
async def test_unknown_keys_are_dropped_not_stored(client):
    res = await client.put(
        f"{BASE}/me/preferences",
        json={"preferences": {"not-a-real-key": "x", "autoplay": False}},
    )
    assert res.status_code == 200
    prefs = res.json()["preferences"]
    assert "not-a-real-key" not in prefs
    assert prefs["autoplay"] is False


@pytest.mark.asyncio
async def test_wrong_typed_values_are_rejected(client):
    res = await client.put(
        f"{BASE}/me/preferences",
        json={"preferences": {"autoplay": "yes-please", "mono": 1}},
    )
    assert res.status_code == 200
    prefs = res.json()["preferences"]
    # Both kept their defaults — nothing invalid was stored.
    assert prefs["autoplay"] is True
    assert prefs["mono"] is False


@pytest.mark.asyncio
async def test_numeric_fields_are_clamped_to_safe_ranges(client):
    res = await client.put(
        f"{BASE}/me/preferences",
        json={"preferences": {"pre-amp-gain": 999, "glass-opacity": 42}},
    )
    prefs = res.json()["preferences"]
    assert -24 <= prefs["pre-amp-gain"] <= 24
    assert 0 <= prefs["glass-opacity"] <= 1


@pytest.mark.asyncio
async def test_preferences_are_scoped_to_the_calling_user(client, client_as_other_user):
    await client.put(
        f"{BASE}/me/preferences", json={"preferences": {"autoplay": False}}
    )

    other = await client_as_other_user.get(f"{BASE}/me/preferences")
    assert other.json()["preferences"]["autoplay"] is True

    # And the other user writing cannot clobber the first user's values.
    await client_as_other_user.put(
        f"{BASE}/me/preferences", json={"preferences": {"autoplay": True}}
    )
    mine = await client.get(f"{BASE}/me/preferences")
    assert mine.json()["preferences"]["autoplay"] is False
