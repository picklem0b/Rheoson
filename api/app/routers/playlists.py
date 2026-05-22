import uuid
import json
from pathlib import Path
from fastapi import APIRouter
from app.schemas.playlist import Playlist, PlaylistCreate
from app.core.config import settings
from datetime import datetime, timezone

router = APIRouter()
_store: dict[str, Playlist] = {}


@router.get("/", response_model=list[Playlist])
async def list_playlists():
    return list(_store.values())


@router.post("/", response_model=Playlist, status_code=201)
async def create_playlist(body: PlaylistCreate):
    pl = Playlist(
        id=str(uuid.uuid4()),
        name=body.name,
        description=body.description,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    _store[pl.id] = pl
    return pl


@router.delete("/{playlist_id}", status_code=204)
async def delete_playlist(playlist_id: str):
    _store.pop(playlist_id, None)
