"""Spotify link resolution and YouTube matching.

No test here touches the network: the embed payload is a canned dict in the
exact shape measured from open.spotify.com (June 2026), and YouTube matching
is stubbed at the search boundary. What is pinned:

* link parsing — every shareable shape, and rejection of everything else;
* the match pipeline — cache first, one search per unknown track, honest
  errors when the tool is missing or the search comes back empty;
* the wire shapes — a track resolves to one Track, a playlist to many, and
  every failure carries its DCCNN chip.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import main
from app.services import spotify

client = TestClient(main.app)

# ── Canned embed payload (measured shape) ─────────────────────

TRACK_ENTITY = {
    "type": "track",
    "name": "Never Gonna Give You Up",
    "title": "Never Gonna Give You Up",
    "artists": [{"name": "Rick Astley", "uri": "spotify:artist:0gxyHStUsqpMadRV0Di1Qt"}],
    "duration": 213573,
    "releaseDate": {"isoString": "1987-11-12T00:00:00Z"},
    "visualIdentity": {
        "image": [
            {"url": "https://image-cdn.example/cover-64.jpg", "maxWidth": 64, "maxHeight": 64},
            {"url": "https://image-cdn.example/cover-300.jpg", "maxWidth": 300, "maxHeight": 300},
        ]
    },
}

PLAYLIST_ENTITY = {
    "type": "playlist",
    "name": "Today's Top Hits",
    "subtitle": "Spotify",
    "visualIdentity": {"image": [{"url": "https://image-cdn.example/pl.jpg", "maxWidth": 300}]},
    "trackList": [
        {
            "uri": "spotify:track:70cHKK8bHAfJrOGVnfRG9J",
            "title": "Nicole Kidman",
            "subtitle": "ADÉLA",
            "duration": 181270,
            "isPlayable": True,
        },
        {
            "uri": "spotify:track:3DqUZkYTG9DjCAc1Rt6Uhe",
            "title": "Golden",
            "subtitle": "HUNTR/X",
            "duration": 180000,
            "isPlayable": False,  # market-restricted — must be skipped
        },
        {"uri": "spotify:album:4aawyAB9vmqN3uQ7FjRGTy", "title": "not a track"},
    ],
}


@pytest.fixture()
def youtube_match(monkeypatch: pytest.MonkeyPatch):
    """Stub the search boundary: the first search returns a videoId."""
    calls: list[str] = []

    def fake_remote(query: str, limit: int = 20):
        calls.append(query)
        return [
            {
                "id": "dQw4w9WgXcQ",
                "videoId": "dQw4w9WgXcQ",
                "title": query,
                "artist": {"id": "x", "name": "x"},
                "album": {"id": "u", "title": "u"},
                "duration": 213.0,
                "artworkUrl": None,
                "source": "youtube",
                "isDownloaded": False,
            }
        ]

    monkeypatch.setattr(spotify.search_service, "search_remote", fake_remote)
    return calls


@pytest.fixture(autouse=True)
def fresh_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    """Every test starts with an empty match cache (the data dir is already
    a per-session temp dir; this also proves the writes land)."""
    spotify._schema_ready = False
    if spotify._conn is not None:
        spotify._conn.close()
        spotify._conn = None
    spotify.db_path().unlink(missing_ok=True)


# ── Link parsing ──────────────────────────────────────────────


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=abc", ("track", "4cOdK2wGLETKBW3PvgPWqT")),
        ("https://open.spotify.com/intl-de/album/4aawyAB9vmqN3uQ7FjRGTy", ("album", "4aawyAB9vmqN3uQ7FjRGTy")),
        ("open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M", ("playlist", "37i9dQZF1DXcBWIGoYBM5M")),
        ("https://play.spotify.com/artist/06HL4z0CvFAxyc27GXpf02", ("artist", "06HL4z0CvFAxyc27GXpf02")),
        ("spotify:track:4cOdK2wGLETKBW3PvgPWqT", ("track", "4cOdK2wGLETKBW3PvgPWqT")),
        ("https://spotify.link/abcFAKE123", ("short", "abcFAKE123")),
        ("spoti.fi/abcFAKE123", ("short", "abcFAKE123")),
    ],
)
def test_parse_link_accepts_every_shareable_shape(url: str, expected: tuple[str, str]) -> None:
    assert spotify.parse_link(url) == expected


@pytest.mark.parametrize(
    "url",
    [
        "",
        "   ",
        "https://youtube.com/watch?v=dQw4w9WgXcQ",
        "https://open.spotify.com/episode/3IMucVoNyYDUmJIepQe3w8",  # not a kind we serve
        "spotify:episode:3IMucVoNyYDUmJIepQe3w8",
        "https://open.spotify.com/track/tooshort",
        "spotify.link/",  # no code
    ],
)
def test_parse_link_rejects_everything_else(url: str) -> None:
    assert spotify.parse_link(url) is None


# ── Matching ──────────────────────────────────────────────────


def test_match_attaches_video_id_and_persists_it(youtube_match: list[str]) -> None:
    tracks = [{"spotifyId": "4cOdK2wGLETKBW3PvgPWqT", "title": "Never Gonna Give You Up", "artist": "Rick Astley", "durationMs": 213573}]

    out = spotify.match_tracks([dict(t) for t in tracks])

    assert out[0]["videoId"] == "dQw4w9WgXcQ"
    assert "matchError" not in out[0]
    assert len(youtube_match) == 1
    # One search per unknown track, and the query is title + artist.
    assert "Never Gonna Give You Up" in youtube_match[0]

    # The match is now a fact: a second pass costs zero searches.
    second = spotify.match_tracks([dict(t) for t in tracks])
    assert second[0]["videoId"] == "dQw4w9WgXcQ"
    assert len(youtube_match) == 1


def test_match_reports_honest_errors_without_the_tool(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class Absent:
        available = False

    monkeypatch.setattr(spotify.toolchain, "ytdlp", lambda: Absent())
    tracks = [{"spotifyId": "abc", "title": "T", "artist": "A"}]

    out = spotify.match_tracks(tracks)

    assert out[0].get("matchError") == "DEN02"


def test_match_reports_an_empty_search_as_not_found(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(spotify.search_service, "search_remote", lambda q, limit=20: [])
    tracks = [{"spotifyId": "abc", "title": "T", "artist": "A"}]

    out = spotify.match_tracks(tracks)

    assert out[0].get("matchError") == "RNF01"


def test_matched_tracks_are_annotated_from_the_identity_map(youtube_match: list[str]) -> None:
    from app.services import identity

    # The identity map is a session-shared record of disk facts (downloads
    # tests write to it), so the premise is set here rather than assumed.
    identity.remove("dQw4w9WgXcQ")

    # Nothing on disk yet: a fresh match is a stream-only track.
    out = spotify.match_tracks(
        [{"spotifyId": "4cOdK2wGLETKBW3PvgPWqT", "title": "Never Gonna Give You Up", "artist": "Rick Astley"}]
    )
    assert out[0]["videoId"] == "dQw4w9WgXcQ"
    assert out[0]["isDownloaded"] is False

    # Once the track is installed, the same answer says so — isDownloaded is
    # a fact about the disk, read at answer time.
    identity.record("dQw4w9WgXcQ", "file123", title="Never Gonna Give You Up", artist="Rick Astley")
    again = spotify.match_tracks(
        [{"spotifyId": "4cOdK2wGLETKBW3PvgPWqT", "title": "Never Gonna Give You Up", "artist": "Rick Astley"}]
    )
    assert again[0]["isDownloaded"] is True


# ── Entity parsing ────────────────────────────────────────────


def test_entity_track_extracts_artists_duration_and_best_cover() -> None:
    meta = spotify._entity_track(TRACK_ENTITY, "4cOdK2wGLETKBW3PvgPWqT")

    assert meta["title"] == "Never Gonna Give You Up"
    assert meta["artist"] == "Rick Astley"
    assert meta["durationMs"] == 213573
    assert meta["artworkUrl"] == "https://image-cdn.example/cover-300.jpg"


def test_entity_tracklist_skips_unplayable_and_non_track_rows() -> None:
    rows = spotify._entity_tracklist(PLAYLIST_ENTITY)

    assert [r["spotifyId"] for r in rows] == ["70cHKK8bHAfJrOGVnfRG9J"]
    assert rows[0]["title"] == "Nicole Kidman"


# ── resolve_link ──────────────────────────────────────────────


def test_resolve_track_link_returns_the_engine_track_shape(
    monkeypatch: pytest.MonkeyPatch, youtube_match: list[str]
) -> None:
    monkeypatch.setattr(spotify, "_fetch_via", lambda kind, sid, client: dict(TRACK_ENTITY))

    body = spotify.resolve_link("https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT")

    assert body["kind"] == "track"
    track = body["track"]
    assert track["id"] == "dQw4w9WgXcQ"
    assert track["videoId"] == "dQw4w9WgXcQ"
    assert track["title"] == "Never Gonna Give You Up"
    assert track["artist"]["name"] == "Rick Astley"
    assert track["album"]["title"] == "Unknown Album"


def test_resolve_playlist_link_returns_all_matched_tracks(
    monkeypatch: pytest.MonkeyPatch, youtube_match: list[str]
) -> None:
    monkeypatch.setattr(spotify, "_fetch_via", lambda kind, sid, client: dict(PLAYLIST_ENTITY))

    body = spotify.resolve_link("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")

    assert body["kind"] == "playlist"
    assert body["title"] == "Today's Top Hits"
    assert len(body["tracks"]) == 1
    assert body["tracks"][0]["videoId"] == "dQw4w9WgXcQ"


def test_resolve_without_matching_leaves_tracks_unmatched(
    monkeypatch: pytest.MonkeyPatch, youtube_match: list[str]
) -> None:
    monkeypatch.setattr(spotify, "_fetch_via", lambda kind, sid, client: dict(TRACK_ENTITY))

    body = spotify.resolve_link(
        "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT", match=False
    )

    assert youtube_match == []  # no searches were spent
    assert body["track"]["unmatched"] is True
    assert body["track"]["id"] == "spotify:4cOdK2wGLETKBW3PvgPWqT"


def test_resolve_rejects_non_spotify_links() -> None:
    with pytest.raises(spotify.SpotifyError) as excinfo:
        spotify.resolve_link("https://youtube.com/watch?v=x")
    assert excinfo.value.code == "RVA02"


def test_resolve_of_an_unknown_id_is_a_404(monkeypatch: pytest.MonkeyPatch) -> None:
    class NotFound(Exception):
        pass

    def raise_404(kind: str, sid: str, client: object) -> dict:
        raise spotify.SpotifyError("TNF01", 404, "gone")

    monkeypatch.setattr(spotify, "_fetch_via", raise_404)
    with pytest.raises(spotify.SpotifyError) as excinfo:
        spotify.resolve_link("https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT")
    assert excinfo.value.code == "TNF01"
    assert excinfo.value.status == 404


# ── HTTP surface ──────────────────────────────────────────────


def test_route_resolve_returns_the_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_resolve(url: str, match: bool = True):
        return {"kind": "track", "track": {"id": "dQw4w9WgXcQ"}}

    monkeypatch.setattr(spotify, "resolve_link", fake_resolve)

    body = client.get("/spotify/resolve", params={"url": "https://open.spotify.com/track/x"}).json()

    assert body["kind"] == "track"
    assert body["track"]["id"] == "dQw4w9WgXcQ"


def test_route_resolve_carries_the_code_on_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(url: str, match: bool = True):
        raise spotify.SpotifyError("RVA02", 400, "not a Spotify link")

    monkeypatch.setattr(spotify, "resolve_link", boom)

    res = client.get("/spotify/resolve", params={"url": "https://youtube.com/watch?v=x"})

    assert res.status_code == 400
    assert res.json()["code"] == "RVA02"
    assert "[ERROR_CODE: RVA02]" in res.json()["error"]


def test_route_resolve_requires_a_url() -> None:
    res = client.get("/spotify/resolve")

    assert res.status_code == 400
    assert res.json()["code"] == "RVA01"


def test_route_match_accepts_a_batch_and_shapes_the_wire(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        spotify, "match_tracks", lambda tracks: [{**t, "videoId": "dQw4w9WgXcQ"} for t in tracks]
    )

    res = client.post("/spotify/match", json={"tracks": [{"spotifyId": "abc", "title": "T", "artist": "A"}]})

    assert res.status_code == 200
    body = res.json()["tracks"][0]
    assert body["id"] == "dQw4w9WgXcQ"
    assert "matchError" not in body


def test_route_match_rejects_bad_bodies() -> None:
    for payload in ([], {"tracks": []}, {"tracks": "nope"}, {"nope": 1}):
        res = client.post("/spotify/match", json=payload)
        assert res.status_code == 400, payload
        assert res.json()["code"] == "RVA03", payload


def test_route_match_rejects_an_oversized_batch() -> None:
    res = client.post(
        "/spotify/match",
        json={"tracks": [{"spotifyId": f"id{i}", "title": "t", "artist": "a"} for i in range(spotify.MAX_BATCH + 1)]},
    )

    assert res.status_code == 400
    assert res.json()["code"] == "RVA03"
