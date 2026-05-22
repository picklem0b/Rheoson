from fastapi import APIRouter
from fastapi.responses import Response
from app.services.stream_service import resolve_track_path, stream_response
from app.services.artwork_service import extract_artwork

router = APIRouter()


@router.get("/{track_id}/audio")
async def stream_audio(track_id: str):
    path = resolve_track_path(track_id)
    return stream_response(path)


@router.get("/{track_id}/artwork")
async def get_artwork(track_id: str):
    path = resolve_track_path(track_id)
    art = extract_artwork(path)
    if art:
        return art
    return Response(status_code=204)
