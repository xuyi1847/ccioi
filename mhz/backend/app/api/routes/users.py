from fastapi import APIRouter, Depends
from app.api.dependencies import get_ccioi_user, get_repository
from app.models import User
from app.repositories.music import MusicRepository
from app.schemas.api import LegacyUserClaimIn

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/claim-legacy")
async def claim_legacy(payload: LegacyUserClaimIn, user: User = Depends(get_ccioi_user), repo: MusicRepository = Depends(get_repository)) -> dict:
    return {"migratedEvents": await repo.claim_legacy_user(payload.legacy_user_id, user.id)}
