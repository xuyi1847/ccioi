from fastapi import APIRouter, Depends, HTTPException
from app.api.dependencies import get_apple_token_service
from app.services.apple_token import AppleDeveloperTokenService

router = APIRouter(prefix="/apple", tags=["apple"])


@router.get("/developer-token")
async def developer_token(service: AppleDeveloperTokenService = Depends(get_apple_token_service)) -> dict:
    try:
        token, expires_at = service.get_token()
    except (RuntimeError, OSError) as exc:
        raise HTTPException(503, str(exc)) from exc
    return {"developerToken": token, "expiresAt": expires_at, "storefront": service.settings.apple_music_storefront}
