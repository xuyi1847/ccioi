from functools import lru_cache
import uuid
import jwt
from fastapi import Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import Settings, get_settings
from app.db.session import get_session
from app.repositories.music import MusicRepository
from app.services.apple_token import AppleDeveloperTokenService
from app.models import User


def get_repository(session: AsyncSession = Depends(get_session)) -> MusicRepository:
    return MusicRepository(session)


def settings_dependency() -> Settings:
    return get_settings()


def get_ccioi_user_id(authorization: str | None = Header(default=None), settings: Settings = Depends(settings_dependency)) -> uuid.UUID:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="请先登录 ccioi")
    try:
        payload = jwt.decode(authorization.removeprefix("Bearer ").strip(), settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        return uuid.UUID(str(payload["sub"]))
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=401, detail="登录已过期，请重新登录") from exc
    except (jwt.InvalidTokenError, KeyError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="无效的 ccioi 登录凭证") from exc


async def get_ccioi_user(user_id: uuid.UUID = Depends(get_ccioi_user_id), repo: MusicRepository = Depends(get_repository)) -> User:
    return await repo.get_or_create_ccioi_user(user_id)


@lru_cache
def get_apple_token_service() -> AppleDeveloperTokenService:
    return AppleDeveloperTokenService(get_settings())
