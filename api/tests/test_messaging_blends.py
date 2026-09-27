"""Messaging + blends API tests.

Messaging and blends are Mongo-backed, so these run on the shared mock DB
(conftest patches ``get_db``). Two mock behaviors matter here:

* ``find({"members": user_id})`` matches documents whose ``members`` array
  contains the user — extended in conftest to mirror Mongo's semantics.
* The messaging rate limiter is in-process state: ``_reset_rate_limit()``
  must run between tests or a test inherits the previous test's send
  history and fails with MLM01.

Blends additionally write a JSON offline mirror into MUSIC_DIR; the
autouse ``_clean_state`` fixture does not know about ``.blends-*.json``,
so these tests remove their own mirror files.

The ``client`` fixtures are async httpx clients — every test here is
``@pytest.mark.asyncio``. ``client`` authenticates as TEST_USER_SUB,
``client_as_other_user`` as _OTHER_SUB, and ``client_anon`` carries no
identity (used with an explicit stranger token for the 403 cases).
"""

from __future__ import annotations

import glob
import os

import pytest

from tests.conftest import (
    TEST_USER_SUB,
    _OTHER_SUB,
    _shared_mock_db,
)

from app.services import messaging_service as ms


@pytest.fixture(autouse=True)
def _msg_clean():
    ms._reset_rate_limit()
    yield
    ms._reset_rate_limit()
    music = os.environ["MUSIC_DIR"]
    for f in glob.glob(os.path.join(music, ".blends-*.json")):
        os.unlink(f)


_STRANGER_TOKEN = "fake-token-stranger-789"
_STRANGER_SUB = "user_stranger_789"


def _register_stranger() -> None:
    """A third identity for access-control assertions."""
    from tests.conftest import _token_registry, _BASE_CLAIMS
    _token_registry[_STRANGER_TOKEN] = {**_BASE_CLAIMS, "sub": _STRANGER_SUB}


# ── Conversations & messages ──────────────────────────────────


@pytest.mark.asyncio
async def test_send_text_message_round_trip(client, client_as_other_user):
    r = await client.post("/api/messages/send",
                          json={"peer_id": _OTHER_SUB, "kind": "text", "text": "listen to this"})
    assert r.status_code == 200, r.text
    msg = r.json()["message"]
    assert msg["text"] == "listen to this"
    assert msg["senderId"] == TEST_USER_SUB

    # The peer reads the same thread (deterministic conversation id).
    r2 = await client_as_other_user.get(f"/api/messages/conversations/{TEST_USER_SUB}")
    assert r2.status_code == 200
    messages = r2.json()["messages"]
    assert len(messages) == 1
    assert messages[0]["id"] == msg["id"]


@pytest.mark.asyncio
async def test_conversation_list_shows_peer_and_preview(client, client_as_other_user):
    await client.post("/api/messages/send",
                      json={"peer_id": _OTHER_SUB, "kind": "text", "text": "hello"})
    r = await client_as_other_user.get("/api/messages/conversations")
    assert r.status_code == 200
    convos = r.json()["conversations"]
    assert len(convos) == 1
    assert convos[0]["peer"]["id"] == TEST_USER_SUB
    assert convos[0]["lastMessage"]["text"] == "hello"


@pytest.mark.asyncio
async def test_empty_text_rejected_with_code(client):
    r = await client.post("/api/messages/send",
                          json={"peer_id": _OTHER_SUB, "kind": "text", "text": "   "})
    assert r.status_code == 400
    assert "[ERROR_CODE: MVA01]" in r.json()["detail"]


@pytest.mark.asyncio
async def test_track_share_with_payload(client):
    payload = {"trackId": "abc123", "title": "Song", "artist": "Someone"}
    r = await client.post("/api/messages/send",
                          json={"peer_id": _OTHER_SUB, "kind": "track", "payload": payload})
    assert r.status_code == 200
    msg = r.json()["message"]
    assert msg["kind"] == "track"
    assert msg["payload"]["trackId"] == "abc123"


@pytest.mark.asyncio
async def test_unknown_share_kind_rejected(client):
    r = await client.post("/api/messages/send",
                          json={"peer_id": _OTHER_SUB, "kind": "meme", "text": "hi"})
    assert r.status_code == 400
    assert "MVA03" in r.json()["detail"]


@pytest.mark.asyncio
async def test_rate_limit_returns_429(client):
    for i in range(30):
        r = await client.post("/api/messages/send",
                              json={"peer_id": _OTHER_SUB, "kind": "text", "text": f"m-{i}"})
        assert r.status_code == 200
    r = await client.post("/api/messages/send",
                          json={"peer_id": _OTHER_SUB, "kind": "text", "text": "one too many"})
    assert r.status_code == 429
    assert "MLM01" in r.json()["detail"]


@pytest.mark.asyncio
async def test_user_search_excludes_self(client):
    # Seed both profiles the way the Clerk webhook does (insert is async).
    await _shared_mock_db.users.insert_one({"_id": TEST_USER_SUB, "username": "testy"})
    await _shared_mock_db.users.insert_one({"_id": _OTHER_SUB, "username": "other"})
    r = await client.get("/api/messages/users/search?q=oth")
    assert r.status_code == 200
    users = r.json()["users"]
    assert [u["id"] for u in users] == [_OTHER_SUB]


# ── Presence ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_presence_snapshot_shape(client):
    from app.websocket import ws_events
    ws_events._sid_users["sid-1"] = TEST_USER_SUB
    ws_events._player_state[TEST_USER_SUB] = {
        "isPlaying": True,
        "currentTrack": {"id": "t1", "title": "Song", "artist": "Artist"},
    }
    try:
        r = await client.get("/api/messages/presence")
        assert r.status_code == 200
        users = r.json()["presence"]
        me = next(u for u in users if u["userId"] == TEST_USER_SUB)
        assert me["listeningTo"] == "Song — Artist"
        assert me["isPlaying"] is True
        assert me["trackId"] == "t1"
    finally:
        ws_events._sid_users.pop("sid-1", None)
        ws_events._player_state.pop(TEST_USER_SUB, None)


def test_listening_line_variants():
    assert ms.listening_line(None) is None
    assert ms.listening_line({"isPlaying": False,
                              "currentTrack": {"title": "X"}}) is None
    assert ms.listening_line({"isPlaying": True,
                              "currentTrack": {"title": "X", "artist": "Y"}}) == "X — Y"
    assert ms.listening_line({"isPlaying": True,
                              "currentTrack": {"title": "X"}}) == "X"


# ── Socket handlers (unit level — no ASGI transport needed) ──


class _SocketRecorder:
    """Stands in for the sio server: captures event registration AND
    emits, so registered handlers can be awaited directly and their
    outbound events asserted."""

    def __init__(self):
        self.emitted: list[tuple[str, dict, str | None]] = []
        self.handlers: dict = {}

    def event(self, fn):
        self.handlers[fn.__name__] = fn
        return fn

    async def emit(self, event, data, room=None, skip_sid=None):
        self.emitted.append((event, data, room if room is not None else skip_sid))


@pytest.mark.asyncio
async def test_socket_message_send_delivers_to_peer(monkeypatch):
    from app.websocket import ws_events

    ws_events._sid_users["sid-a"] = TEST_USER_SUB
    ws_events._sid_users["sid-b"] = _OTHER_SUB
    sio = _SocketRecorder()

    async def fake_broadcast(_sio):
        return None

    monkeypatch.setattr(ws_events, "_broadcast_presence", fake_broadcast)
    ws_events.register_events(sio)
    try:
        await sio.handlers["message_send"]("sid-a", {"peer_id": _OTHER_SUB, "text": "via socket"})
    finally:
        ws_events._sid_users.pop("sid-a", None)
        ws_events._sid_users.pop("sid-b", None)

    events = [e for e, _d, _r in sio.emitted]
    assert "message:ack" in events
    assert "message:new" in events
    ack = next(d for e, d, _r in sio.emitted if e == "message:ack")
    assert ack["text"] == "via socket"
    new = next(d for e, d, _r in sio.emitted if e == "message:new")
    assert new["senderId"] == TEST_USER_SUB
    # Persisted exactly once.
    assert len(_shared_mock_db.messages._docs) == 1


@pytest.mark.asyncio
async def test_socket_message_send_unauthenticated_rejected():
    from app.websocket import ws_events
    sio = _SocketRecorder()
    ws_events.register_events(sio)
    await sio.handlers["message_send"]("sid-anon", {"peer_id": _OTHER_SUB, "text": "hi"})
    assert sio.emitted[0][0] == "message:error"


# ── Blends ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_blend_create_and_list(client):
    r = await client.post("/api/blends", json={"name": "Road trip"})
    assert r.status_code == 200, r.text
    blend = r.json()["blend"]
    assert blend["name"] == "Road trip"
    assert blend["owner"] == TEST_USER_SUB
    assert blend["members"] == [TEST_USER_SUB]

    r = await client.get("/api/blends")
    names = [b["name"] for b in r.json()["blends"]]
    assert "Road trip" in names


@pytest.mark.asyncio
async def test_blend_membership_flow(client, client_as_other_user, client_anon):
    _register_stranger()
    r = await client.post("/api/blends", json={"name": "Shared"})
    blend_id = r.json()["blend"]["id"]

    # Owner adds the peer as a member.
    r = await client.post(f"/api/blends/{blend_id}/members", json={"user_id": _OTHER_SUB})
    assert r.status_code == 200
    assert sorted(r.json()["blend"]["members"]) == sorted([TEST_USER_SUB, _OTHER_SUB])

    # The peer can now add a track.
    r = await client_as_other_user.post(f"/api/blends/{blend_id}/tracks",
                                        json={"track_id": "track-1"})
    assert r.status_code == 200
    assert r.json()["blend"]["tracks"] == ["track-1"]

    # Duplicate add → conflict code.
    r = await client_as_other_user.post(f"/api/blends/{blend_id}/tracks",
                                        json={"track_id": "track-1"})
    assert r.status_code == 409
    assert "BCN02" in r.json()["detail"]

    # A stranger can neither read nor touch the blend. 404 when only the
    # mirror is live (they have no copy — and it does not leak existence),
    # 403 from the membership check when Mongo is.
    r = await client_anon.get(f"/api/blends/{blend_id}",
                              headers={"Authorization": f"Bearer {_STRANGER_TOKEN}"})
    assert r.status_code in (403, 404)


@pytest.mark.asyncio
async def test_blend_remove_member_rules(client, client_as_other_user):
    r = await client.post("/api/blends", json={"name": "Rules"})
    blend_id = r.json()["blend"]["id"]
    await client.post(f"/api/blends/{blend_id}/members", json={"user_id": _OTHER_SUB})

    # A member cannot remove the owner.
    r = await client_as_other_user.delete(f"/api/blends/{blend_id}/members/{TEST_USER_SUB}")
    assert r.status_code == 403

    # The owner removes the member — the member loses access (403 via the
    # Mongo membership check, 404 when their mirror no longer holds a copy).
    r = await client.delete(f"/api/blends/{blend_id}/members/{_OTHER_SUB}")
    assert r.status_code == 200
    r = await client_as_other_user.get(f"/api/blends/{blend_id}")
    assert r.status_code in (403, 404)


@pytest.mark.asyncio
async def test_blend_delete_owner_only(client, client_as_other_user):
    r = await client.post("/api/blends", json={"name": "Doomed"})
    blend_id = r.json()["blend"]["id"]
    await client.post(f"/api/blends/{blend_id}/members", json={"user_id": _OTHER_SUB})

    # Member cannot delete.
    r = await client_as_other_user.delete(f"/api/blends/{blend_id}")
    assert r.status_code == 403
    assert "BCF01" in r.json()["detail"]

    # Owner can.
    r = await client.delete(f"/api/blends/{blend_id}")
    assert r.status_code == 200
    r = await client.get(f"/api/blends/{blend_id}")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_blend_reorder_and_offline_mirror(client):
    r = await client.post("/api/blends", json={"name": "Ordered"})
    blend_id = r.json()["blend"]["id"]
    for tid in ("a", "b", "c"):
        await client.post(f"/api/blends/{blend_id}/tracks", json={"track_id": tid})

    r = await client.put(f"/api/blends/{blend_id}/tracks", json={"track_ids": ["c", "a", "b"]})
    assert r.json()["blend"]["tracks"] == ["c", "a", "b"]

    # Wrong reorder set → playlist-style mismatch code.
    r = await client.put(f"/api/blends/{blend_id}/tracks", json={"track_ids": ["c", "a"]})
    assert r.status_code == 400

    # The offline mirror exists for the owner and holds the same data.
    from app.services import blends_service as bs
    mirror = bs._read_mirror(TEST_USER_SUB)
    assert blend_id in mirror
    assert mirror[blend_id]["tracks"] == ["c", "a", "b"]


@pytest.mark.asyncio
async def test_blend_name_validation(client):
    r = await client.post("/api/blends", json={"name": "  "})
    assert r.status_code == 400
    assert "BVA01" in r.json()["detail"]
    # 81 chars: pydantic caps the request at 80 (422) — the service's own
    # BVA02 guard is defense-in-depth for non-pydantic callers.
    r = await client.post("/api/blends", json={"name": "x" * 81})
    assert r.status_code in (400, 422)
