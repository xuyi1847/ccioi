from fastapi import APIRouter, Depends
from app.api.dependencies import get_repository
from app.repositories.music import MusicRepository
from app.schemas.api import AnonymousUserOut

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/anonymous", response_model=AnonymousUserOut, response_model_by_alias=True)
async def anonymous_user(repo: MusicRepository = Depends(get_repository)) -> AnonymousUserOut:
    user = await repo.create_anonymous_user()
    return AnonymousUserOut(userId=user.id)
