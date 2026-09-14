import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from app.api.dependencies import get_apple_token_service, get_repository, settings_dependency
from app.core.config import Settings
from app.repositories.music import MusicRepository
from app.services.apple_token import AppleDeveloperTokenService
from app.services.providers.apple import AppleMusicProvider

router = APIRouter(prefix="/apple", tags=["apple"])
logger = logging.getLogger(__name__)


@router.get("/developer-token")
async def developer_token(service: AppleDeveloperTokenService = Depends(get_apple_token_service)) -> dict:
    try:
        token, expires_at = service.get_token()
    except (RuntimeError, OSError) as exc:
        raise HTTPException(503, str(exc)) from exc
    return {"developerToken": token, "expiresAt": expires_at, "storefront": service.settings.apple_music_storefront}


@router.post("/bootstrap")
async def bootstrap_personal_catalog(
    limit: int = Query(100, ge=20, le=200),
    music_user_token: str = Header(alias="Music-User-Token"),
    repo: MusicRepository = Depends(get_repository),
    settings: Settings = Depends(settings_dependency),
    token_service: AppleDeveloperTokenService = Depends(get_apple_token_service),
) -> dict:
    """Import playable candidates while keeping the user's Apple token ephemeral."""
    if settings.music_provider != "apple":
        raise HTTPException(409, "Apple Music provider is not active")
    provider = AppleMusicProvider(settings, token_service)
    try:
        items = await provider.get_personal_candidates(music_user_token, limit)
        seed_artists = list(dict.fromkeys(item.artist for item in items if item.artist != "Unknown"))[:5]
        for query in seed_artists:
            try:
                items.extend(await provider.search_tracks(query, 12))
            except Exception:
                continue
        if not items:
            for query in ("周杰伦", "王菲", "Radiohead", "Taylor Swift"):
                items.extend(await provider.search_tracks(query, 15))
        tracks = await repo.import_provider_tracks(items[:limit], provider.name, settings.apple_music_storefront)
        chinese_items = []
        for query in ("周杰伦", "王菲", "陈奕迅", "孙燕姿"):
            try:
                found = await provider.search_tracks(query, 12)
                for item in found:
                    item.metadata["language"] = "zh"
                chinese_items.extend(found)
            except Exception:
                continue
        chinese_tracks = await repo.import_provider_tracks(chinese_items, provider.name, settings.apple_music_storefront)
        unique_ids = list(dict.fromkeys(str(track.id) for track in tracks + chinese_tracks))
        return {"count": len(unique_ids), "trackIds": unique_ids}
    except Exception as exc:
        logger.exception("Apple Music personal catalog bootstrap failed")
        raise HTTPException(502, f"Apple Music personal catalog unavailable: {exc}") from exc
