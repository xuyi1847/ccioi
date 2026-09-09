from fastapi import APIRouter, Depends, HTTPException
from app.api.dependencies import get_repository
from app.models import UserTrackEvent
from app.repositories.music import MusicRepository
from app.schemas.api import EventIn

router = APIRouter(prefix="/events", tags=["events"])


@router.post("", status_code=201)
async def record_event(payload: EventIn, repo: MusicRepository = Depends(get_repository)) -> dict:
    if not await repo.get_user(payload.user_id):
        raise HTTPException(404, "User not found")
    event = UserTrackEvent(**payload.model_dump())
    await repo.add_event(event)
    return {"data": {"id": event.id}, "error": None}
