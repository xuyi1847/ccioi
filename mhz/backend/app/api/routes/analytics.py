from fastapi import APIRouter, Depends
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.models import UserTrackEvent

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/discovery")
async def discovery_metrics(session: AsyncSession = Depends(get_session)) -> dict:
    total_tracks = int(await session.scalar(select(func.count(func.distinct(UserTrackEvent.track_id))).where(UserTrackEvent.event_type == "impression")) or 0)
    favorite_tracks = int(await session.scalar(select(func.count(func.distinct(UserTrackEvent.track_id))).where(UserTrackEvent.event_type == "favorite")) or 0)
    completed = int(await session.scalar(select(func.count()).where(UserTrackEvent.event_type == "play_complete")) or 0)
    starts = int(await session.scalar(select(func.count()).where(UserTrackEvent.event_type == "play_start")) or 0)
    skip_30 = int(await session.scalar(select(func.count()).where(UserTrackEvent.event_type == "skip", UserTrackEvent.play_duration_ms <= 30000)) or 0)
    return {
        "discoveryHitRate": favorite_tracks / total_tracks if total_tracks else 0,
        "unknownCompletionRate": completed / starts if starts else 0,
        "skipAt30": skip_30 / starts if starts else 0,
        "sampleSize": starts,
    }
