import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.models import Channel, Track, TrackProvider, User, UserTrackEvent
from app.services.providers.base import ProviderTrack


class MusicRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_anonymous_user(self) -> User:
        user = User(anonymous_id=uuid.uuid4().hex)
        self.session.add(user)
        await self.session.commit()
        await self.session.refresh(user)
        return user

    async def get_user(self, user_id: uuid.UUID) -> User | None:
        return await self.session.get(User, user_id)

    async def list_channels(self) -> list[Channel]:
        result = await self.session.scalars(select(Channel).where(Channel.active.is_(True)).order_by(Channel.frequency))
        return list(result)

    async def get_channel(self, channel_id: str) -> Channel | None:
        return await self.session.get(Channel, channel_id)

    async def add_event(self, event: UserTrackEvent) -> UserTrackEvent:
        self.session.add(event)
        await self.session.commit()
        await self.session.refresh(event)
        return event

    async def candidate_tracks(self, excluded: set[uuid.UUID], provider: str | None = None, language: str | None = None) -> list[Track]:
        statement: Select[tuple[Track]] = select(Track).options(selectinload(Track.providers))
        if provider:
            statement = statement.join(TrackProvider).where(TrackProvider.provider == provider)
        if language:
            statement = statement.where(Track.metadata_json["language"].as_string() == language)
        if excluded:
            statement = statement.where(Track.id.not_in(excluded))
        rows = await self.session.scalars(statement.limit(250))
        return list(rows)

    async def import_provider_tracks(self, items: list[ProviderTrack], provider: str, storefront: str) -> list[Track]:
        imported: list[Track] = []
        for item in items:
            existing = await self.session.scalar(
                select(Track).join(TrackProvider).options(selectinload(Track.providers)).where(
                    TrackProvider.provider == provider, TrackProvider.provider_track_id == item.provider_id,
                    TrackProvider.storefront == storefront,
                )
            )
            if existing:
                if item.metadata.get("language"):
                    existing.metadata_json = {**existing.metadata_json, "language": item.metadata["language"]}
                mapping = next((entry for entry in existing.providers if entry.provider == provider), None)
                if mapping:
                    mapping.provider_metadata = item.metadata
                imported.append(existing)
                continue
            track = Track(title=item.title, artist_name=item.artist, album_name=item.album, isrc=item.isrc,
                          duration_ms=item.duration_ms, genre=item.genres,
                          metadata_json={"artworkUrl": item.artwork_url, "language": item.metadata.get("language")}, popularity=.5)
            track.providers.append(TrackProvider(provider=provider, provider_track_id=item.provider_id, storefront=storefront, provider_metadata=item.metadata))
            self.session.add(track)
            imported.append(track)
        await self.session.commit()
        return imported

    async def clear_provider_language(self, provider: str, language: str) -> None:
        tracks = await self.session.scalars(
            select(Track).join(TrackProvider).where(
                TrackProvider.provider == provider,
                Track.metadata_json["language"].as_string() == language,
            )
        )
        for track in tracks:
            track.metadata_json = {**track.metadata_json, "language": None}
        await self.session.commit()

    async def recent_events(self, user_id: uuid.UUID, limit: int = 300) -> list[tuple[UserTrackEvent, Track]]:
        rows = await self.session.execute(
            select(UserTrackEvent, Track)
            .join(Track, Track.id == UserTrackEvent.track_id)
            .where(UserTrackEvent.user_id == user_id)
            .order_by(UserTrackEvent.created_at.desc())
            .limit(limit)
        )
        return list(rows.tuples())

    async def skip_counts(self, user_id: uuid.UUID) -> dict[uuid.UUID, int]:
        since = datetime.now(timezone.utc) - timedelta(days=7)
        rows = await self.session.execute(
            select(UserTrackEvent.track_id, func.count())
            .where(UserTrackEvent.user_id == user_id, UserTrackEvent.event_type == "skip", UserTrackEvent.created_at >= since)
            .group_by(UserTrackEvent.track_id)
        )
        return {track_id: int(count) for track_id, count in rows}
