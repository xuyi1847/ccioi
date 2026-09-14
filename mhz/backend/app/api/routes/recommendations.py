import uuid
from fastapi import APIRouter, Depends, HTTPException
from app.api.dependencies import get_ccioi_user, get_repository, settings_dependency
from app.models import User
from app.core.config import Settings
from app.repositories.music import MusicRepository
from app.schemas.api import ProviderOut, ReasonOut, RecommendationIn, RecommendationOut, TrackOut
from app.services.recommendation import RecommendationEngine
from app.services.collaborative_filtering import CollaborativeFilteringService

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.post("/next", response_model=RecommendationOut, response_model_by_alias=True)
async def next_recommendation(payload: RecommendationIn, user: User = Depends(get_ccioi_user), repo: MusicRepository = Depends(get_repository), settings: Settings = Depends(settings_dependency)) -> RecommendationOut:
    channel = await repo.get_channel(payload.channel_id)
    if not channel: raise HTTPException(404, "Channel not found")
    history = await repo.recent_events(user.id)
    collaborative_scores = CollaborativeFilteringService().score_candidates(user.id, history, await repo.collaborative_events())
    provider_name = {"apple": "appleMusic", "audius": "audius", "musicbrainz": "musicbrainz"}.get(settings.music_provider, "mock")
    language = "zh" if channel.id == "chinese" else None
    candidates = await repo.candidate_tracks(user.id, set(payload.exclude_track_ids), provider_name, language)
    if not candidates and language:
        candidates = await repo.candidate_tracks(user.id, set(payload.exclude_track_ids), provider_name)
    if collaborative_scores:
        collaborative_tracks = await repo.tracks_by_ids(set(collaborative_scores) - set(payload.exclude_track_ids), provider_name)
        existing_ids = {track.id for track in candidates}
        candidates.extend(track for track in collaborative_tracks if track.id not in existing_ids)
    engine = RecommendationEngine()
    ranked = engine.rank(candidates, history, channel, set(payload.exclude_track_ids), await repo.skip_counts(user.id))
    ranked = engine.blend_collaborative(ranked, collaborative_scores, 0.30 if channel.id in {"discovery", "roam"} else 0.20)
    selected = engine.choose(ranked)
    blocked = {event.track_id for event, _ in history if event.event_type in {"dislike", "unavailable"}}
    track = selected.track if selected else engine.fallback(candidates, set(payload.exclude_track_ids) | blocked)
    if not track: raise HTTPException(503, "No recommendation is currently available")
    provider = next(item for item in track.providers if item.provider == provider_name)
    recommendation_id = uuid.uuid4()
    return RecommendationOut(
        recommendationId=recommendation_id,
        track=TrackOut(id=track.id, title=track.title, artist=track.artist_name, album=track.album_name,
                       artworkUrl=track.metadata_json.get("artworkUrl"), durationMs=track.duration_ms,
                       streamUrl=provider.provider_metadata.get("streamUrl"),
                       licenseUrl=provider.provider_metadata.get("licenseUrl"),
                       playbackType=provider.provider_metadata.get("playbackType", "stream" if provider.provider_metadata.get("streamUrl") else "external"),
                       externalLinks=provider.provider_metadata.get("externalLinks", {}),
                       provider=ProviderOut(name=provider.provider, trackId=provider.provider_track_id)),
        reason=ReasonOut(type=selected.reason if selected else "fallback", confidence=max(0.1, min(0.99, selected.score if selected else 0.2))),
    )
