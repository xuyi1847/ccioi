import uuid
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Channel, Track, TrackProvider
from app.services.providers.mock import MOCK_TRACKS

CHANNELS = [
    ("private", 87.5, "私人兆赫", "personal", {"familiarRatio": .15, "discoveryRatio": .65, "exploreRatio": .20}),
    ("chinese", 90.8, "华语兆赫", "chinese", {"familiarRatio": .35, "discoveryRatio": .50, "exploreRatio": .15}),
    ("discovery", 94.2, "发现兆赫", "discovery", {"familiarRatio": .05, "discoveryRatio": .80, "exploreRatio": .15}),
    ("familiar", 101.7, "熟悉兆赫", "familiar", {"familiarRatio": .60, "discoveryRatio": .30, "exploreRatio": .10}),
    ("roam", 106.9, "漫游兆赫", "explore", {"familiarRatio": .05, "discoveryRatio": .35, "exploreRatio": .60}),
]


async def seed_data(session: AsyncSession, include_mock_tracks: bool = True) -> None:
    existing_channels = set(await session.scalars(select(Channel.id)))
    session.add_all([Channel(id=item[0], frequency=item[1], name=item[2], channel_type=item[3], config=item[4]) for item in CHANNELS if item[0] not in existing_channels])
    if include_mock_tracks and not await session.scalar(select(func.count(Track.id))):
        for index, item in enumerate(MOCK_TRACKS):
            track = Track(
                id=uuid.uuid5(uuid.NAMESPACE_URL, f"mhz:{item.provider_id}"), title=item.title, artist_name=item.artist,
                album_name=item.album, isrc=item.isrc, duration_ms=item.duration_ms, genre=item.genres,
                metadata_json={"artworkUrl": item.artwork_url}, popularity=1 - index / 20,
            )
            track.providers.append(TrackProvider(provider="mock", provider_track_id=item.provider_id, storefront="global", provider_metadata={}))
            session.add(track)
    await session.commit()
