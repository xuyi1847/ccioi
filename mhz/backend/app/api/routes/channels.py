from fastapi import APIRouter, Depends
from app.api.dependencies import get_repository
from app.repositories.music import MusicRepository
from app.schemas.api import ChannelOut

router = APIRouter(prefix="/channels", tags=["channels"])


@router.get("", response_model=list[ChannelOut], response_model_by_alias=True)
async def channels(repo: MusicRepository = Depends(get_repository)) -> list[ChannelOut]:
    return [ChannelOut.model_validate(item) for item in await repo.list_channels()]
