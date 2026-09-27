"""Messaging REST routes — `/api/messages`.

The socket path (`message:send` in ws_events) is the fast path; these
routes are the always-works path and the source of truth. Both funnel
through ``messaging_service.send_message`` — identical validation,
rate limit, and DCCNN codes.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.core.database import get_db
from app.core.deps import get_current_user
from app.services import messaging_service as ms

router = APIRouter()


class SendMessageSchema(BaseModel):
    peer_id: str = Field(min_length=1, max_length=128)
    kind: str = Field(default="text")
    text: str | None = Field(default=None, max_length=4000)
    payload: dict | None = None


class ProfilesBatchSchema(BaseModel):
    user_ids: list[str] = Field(max_length=50)


@router.get("/users/search")
async def search_users(
    q: str = Query(default="", max_length=64),
    limit: int = Query(default=10, ge=1, le=20),
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    """Find users by username prefix — powers the new-chat picker."""
    me = user["sub"]
    results = await ms.search_users(db, me, q, limit)
    return {"users": results}


@router.get("/conversations")
async def list_conversations(
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    """The caller's threads, most recently active first."""
    me = user["sub"]
    conversations = await ms.list_conversations(db, me)
    return {"conversations": conversations}


@router.post("/conversations")
async def open_conversation(
    body: SendMessageSchema,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    """Open (or fetch) the DM thread with a peer."""
    me = user["sub"]
    conversation = await ms.get_or_create_conversation(db, me, body.peer_id)
    return {"conversation": conversation}


@router.get("/conversations/{peer_id}")
async def list_messages(
    peer_id: str,
    limit: int = Query(default=ms.DEFAULT_MESSAGES_PAGE, ge=1, le=ms.MAX_MESSAGES_PAGE),
    before: str | None = Query(default=None),
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    """One page of a thread, oldest → newest (`before` = ISO cursor)."""
    me = user["sub"]
    messages = await ms.list_messages(db, me, peer_id, limit, before)
    return {"messages": messages}


@router.post("/send")
async def send_message(
    body: SendMessageSchema,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    """Send a message/share. The socket path delivers the same payload."""
    me = user["sub"]
    message = await ms.send_message(db, me, body.peer_id, body.kind, body.text, body.payload)
    return {"message": message}


@router.post("/profiles")
async def profiles_batch(
    body: ProfilesBatchSchema,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    """Batch display info for member lists and share cards.

    POST (not GET) because the id list rides the body, and the id cap in
    ``ProfilesBatchSchema`` mirrors the service's own — a client cannot
    ask for the whole instance.
    """
    profiles = await ms.profiles_batch(db, body.user_ids)
    return {"profiles": profiles}


@router.get("/presence")
async def presence(user: dict = Depends(get_current_user)):
    """Who is connected right now and what they are listening to.

    Profiles for connected users are resolved from Mongo (username/avatar)
    and handed to the socket layer's cache, so presence broadcasts carry
    real names even though the socket layer itself never touches Mongo.
    """
    from app.core.database import db_available, get_db as _get_db
    from app.services import messaging_service as ms
    from app.websocket.ws_events import presence_users, sids_snapshot, remember_profile

    sids = sids_snapshot()
    connected = sorted(set(sids.values()))
    if db_available() and connected:
        db = _get_db()
        for uid in connected:
            info = await ms.peer_info(db, uid)
            remember_profile(uid, {"username": info["username"], "image_url": info["image_url"]})
    return {"presence": presence_users()}
