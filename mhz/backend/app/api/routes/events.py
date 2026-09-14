from fastapi import APIRouter, Depends
from app.api.dependencies import get_ccioi_user, get_repository
from app.models import User, UserTrackEvent
from app.repositories.music import MusicRepository
from app.schemas.api import EventIn

router = APIRouter(prefix="/events", tags=["events"])


@router.post("", status_code=201)
async def record_event(payload: EventIn, user: User = Depends(get_ccioi_user), repo: MusicRepository = Depends(get_repository)) -> dict:
    event = UserTrackEvent(user_id=user.id, **payload.model_dump())
    await repo.add_event(event)
    return {"data": {"id": event.id}, "error": None}


@router.get("/favorites")
async def favorites(user: User = Depends(get_ccioi_user), repo: MusicRepository = Depends(get_repository)) -> dict:
    return {"trackIds": [str(item) for item in await repo.favorite_track_ids(user.id)]}
