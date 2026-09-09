from functools import lru_cache
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import Settings, get_settings
from app.db.session import get_session
from app.repositories.music import MusicRepository
from app.services.apple_token import AppleDeveloperTokenService


def get_repository(session: AsyncSession = Depends(get_session)) -> MusicRepository:
    return MusicRepository(session)


def settings_dependency() -> Settings:
    return get_settings()


@lru_cache
def get_apple_token_service() -> AppleDeveloperTokenService:
    return AppleDeveloperTokenService(get_settings())
