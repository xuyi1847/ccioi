import uuid
from fastapi import APIRouter, Depends, HTTPException
from app.api.dependencies import get_repository, settings_dependency
from app.core.config import Settings
from app.repositories.music import MusicRepository
from app.schemas.api import ProviderOut, ReasonOut, RecommendationIn, RecommendationOut, TrackOut
from app.services.recommendation import RecommendationEngine

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.post("/next", response_model=RecommendationOut, response_model_by_alias=True)
async def next_recommendation(payload: RecommendationIn, repo: MusicRepository = Depends(get_repository), settings: Settings = Depends(settings_dependency)) -> RecommendationOut:
    if not await repo.get_user(payload.user_id): raise HTTPException(404, "User not found")
    channel = await repo.get_channel(payload.channel_id)
    if not channel: raise HTTPException(404, "Channel not found")
    history = await repo.recent_events(payload.user_id)
    provider_name = "appleMusic" if settings.music_provider == "apple" else "mock"
    candidates = await repo.candidate_tracks(set(payload.exclude_track_ids), provider_name)
    engine = RecommendationEngine()
    ranked = engine.rank(candidates, history, channel, set(payload.exclude_track_ids), await repo.skip_counts(payload.user_id))
    selected = ranked[0] if ranked else None
    track = selected.track if selected else engine.fallback(candidates, set(payload.exclude_track_ids))
    if not track: raise HTTPException(503, "No recommendation is currently available")
    provider = track.providers[0]
    recommendation_id = uuid.uuid4()
    return RecommendationOut(
        recommendationId=recommendation_id,
        track=TrackOut(id=track.id, title=track.title, artist=track.artist_name, album=track.album_name,
                       artworkUrl=track.metadata_json.get("artworkUrl"), durationMs=track.duration_ms,
                       provider=ProviderOut(name=provider.provider, trackId=provider.provider_track_id)),
        reason=ReasonOut(type=selected.reason if selected else "fallback", confidence=max(0.1, min(0.99, selected.score if selected else 0.2))),
    )
