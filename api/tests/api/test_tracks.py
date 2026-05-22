import pytest


@pytest.mark.asyncio
async def test_list_tracks_empty(client):
    resp = await client.get("/api/v1/tracks/")
    assert resp.status_code == 200
    data = resp.json()
    assert "tracks" in data
