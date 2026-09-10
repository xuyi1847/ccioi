from fastapi import APIRouter, Depends, HTTPException, Query
from app.api.dependencies import get_apple_token_service, get_repository, settings_dependency
from app.core.config import Settings
from app.repositories.music import MusicRepository
from app.services.apple_token import AppleDeveloperTokenService
from app.services.providers.apple import AppleMusicProvider
from app.services.providers.audius import AudiusProvider
from app.services.providers.mock import MockMusicProvider
from app.services.providers.musicbrainz import MusicBrainzProvider

router = APIRouter(prefix="/tracks", tags=["tracks"])


@router.get("/search")
async def search_tracks(q: str = Query(min_length=1, max_length=100), limit: int = Query(10, ge=1, le=25), repo: MusicRepository = Depends(get_repository), settings: Settings = Depends(settings_dependency), token_service: AppleDeveloperTokenService = Depends(get_apple_token_service)) -> dict:
    try:
        if settings.music_provider == "apple":
            provider = AppleMusicProvider(settings, token_service)
            storefront = settings.apple_music_storefront
        elif settings.music_provider == "audius":
            provider = AudiusProvider(settings)
            storefront = "global"
        elif settings.music_provider == "musicbrainz":
            provider = MusicBrainzProvider(settings)
            storefront = "global"
        else:
            provider = MockMusicProvider()
            storefront = "global"
        items = await provider.search_tracks(q, limit)
        tracks = await repo.import_provider_tracks(items, provider.name, storefront)
        return {"count": len(tracks), "trackIds": [str(track.id) for track in tracks]}
    except Exception as exc:
        raise HTTPException(502, f"Music catalog unavailable: {exc}") from exc


@router.post("/discover")
async def discover_tracks(
    limit: int = Query(100, ge=10, le=200),
    repo: MusicRepository = Depends(get_repository),
    settings: Settings = Depends(settings_dependency),
) -> dict:
    if settings.music_provider != "audius":
        return {"count": 0, "trackIds": []}
    try:
        provider = AudiusProvider(settings)
        items = await provider.get_trending_tracks(limit)
        tracks = await repo.import_provider_tracks(items, provider.name, "global")
        return {"count": len(tracks), "trackIds": [str(track.id) for track in tracks]}
    except Exception as exc:
        raise HTTPException(502, f"Audius catalog unavailable: {exc}") from exc


@router.post("/discover/metadata")
async def discover_metadata_tracks(
    limit: int = Query(100, ge=10, le=100),
    q: str = Query('artist:"Radiohead" OR artist:"Coldplay" OR artist:"Taylor Swift" OR artist:"Daft Punk"'),
    repo: MusicRepository = Depends(get_repository),
    settings: Settings = Depends(settings_dependency),
) -> dict:
    """Import discoverable metadata; no audio is downloaded or proxied."""
    try:
        provider = MusicBrainzProvider(settings)
        items = await provider.search_tracks(q, limit)
        tracks = await repo.import_provider_tracks(items, provider.name, "global")
        return {"count": len(tracks), "trackIds": [str(track.id) for track in tracks]}
    except Exception as exc:
        raise HTTPException(502, f"MusicBrainz catalog unavailable: {exc}") from exc


@router.post("/discover/chinese")
async def discover_chinese_tracks(
    limit: int = Query(100, ge=10, le=200),
    repo: MusicRepository = Depends(get_repository),
    settings: Settings = Depends(settings_dependency),
) -> dict:
    try:
        if settings.music_provider == "audius":
            provider = AudiusProvider(settings)
            items = await provider.get_chinese_tracks(limit)
        elif settings.music_provider == "musicbrainz":
            provider = MusicBrainzProvider(settings)
            items = await provider.search_tracks('artist:"周杰伦" OR artist:"王菲" OR artist:"陈奕迅" OR artist:"孙燕姿"', min(limit, 100))
            for item in items:
                item.metadata["language"] = "zh"
        else:
            return {"count": 0, "trackIds": []}
        await repo.clear_provider_language(provider.name, "zh")
        tracks = await repo.import_provider_tracks(items, provider.name, "global")
        return {"count": len(tracks), "trackIds": [str(track.id) for track in tracks]}
    except Exception as exc:
        raise HTTPException(502, f"Audius Chinese catalog unavailable: {exc}") from exc
