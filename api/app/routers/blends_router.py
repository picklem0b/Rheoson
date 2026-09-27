"""Blends routes — `/api/blends`.

Collaborative playlists: every member can manage tracks and members,
only the owner can delete. Mongo is the source of truth; a per-user JSON
mirror in MUSIC_DIR keeps each member's blends readable and playable when
the database is unreachable.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.database import get_db
from app.core.deps import get_current_user
from app.services import blends_service as bs

router = APIRouter()


class CreateBlendSchema(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class RenameBlendSchema(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class TrackSchema(BaseModel):
    track_id: str = Field(min_length=1, max_length=128)


class ReorderSchema(BaseModel):
    track_ids: list[str] = Field(max_length=500)


class MemberSchema(BaseModel):
    user_id: str = Field(min_length=1, max_length=128)


@router.get("")
async def list_blends(
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    """All blends the caller belongs to."""
    blends = await bs.list_blends(db, user["sub"])
    return {"blends": blends}


@router.post("")
async def create_blend(
    body: CreateBlendSchema,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    blend = await bs.create_blend(db, user["sub"], body.name)
    return {"blend": blend}


@router.get("/{blend_id}")
async def get_blend(
    blend_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    blend = await bs.get_blend(db, user["sub"], blend_id)
    return {"blend": blend}


@router.patch("/{blend_id}")
async def rename_blend(
    blend_id: str,
    body: RenameBlendSchema,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    blend = await bs.rename_blend(db, user["sub"], blend_id, body.name)
    return {"blend": blend}


@router.delete("/{blend_id}")
async def delete_blend(
    blend_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    await bs.delete_blend(db, user["sub"], blend_id)
    return {"ok": True}


@router.post("/{blend_id}/tracks")
async def add_track(
    blend_id: str,
    body: TrackSchema,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    blend = await bs.add_track(db, user["sub"], blend_id, body.track_id)
    return {"blend": blend}


@router.delete("/{blend_id}/tracks/{track_id}")
async def remove_track(
    blend_id: str,
    track_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    blend = await bs.remove_track(db, user["sub"], blend_id, track_id)
    return {"blend": blend}


@router.put("/{blend_id}/tracks")
async def reorder_tracks(
    blend_id: str,
    body: ReorderSchema,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    blend = await bs.reorder_tracks(db, user["sub"], blend_id, body.track_ids)
    return {"blend": blend}


@router.post("/{blend_id}/members")
async def add_member(
    blend_id: str,
    body: MemberSchema,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    blend = await bs.add_member(db, user["sub"], blend_id, body.user_id)
    return {"blend": blend}


@router.delete("/{blend_id}/members/{member_id}")
async def remove_member(
    blend_id: str,
    member_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    blend = await bs.remove_member(db, user["sub"], blend_id, member_id)
    return {"blend": blend}
