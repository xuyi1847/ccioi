from app.services.providers.base import MusicProvider, ProviderTrack

MOCK_TRACKS = [
    ProviderTrack("mock-01", "Midnight Frequency", "Northbound", "Signals", duration_ms=224000, genres=["Alternative"], artwork_url="https://picsum.photos/seed/mhz01/900"),
    ProviderTrack("mock-02", "Glass Satellites", "Mira Vale", "Low Orbit", duration_ms=207000, genres=["Dream Pop"], artwork_url="https://picsum.photos/seed/mhz02/900"),
    ProviderTrack("mock-03", "After the Rain", "Paper Cinema", "Soft Engines", duration_ms=246000, genres=["Indie"], artwork_url="https://picsum.photos/seed/mhz03/900"),
    ProviderTrack("mock-04", "Blue Hour", "The Quiet Lines", "Night Maps", duration_ms=198000, genres=["Electronic"], artwork_url="https://picsum.photos/seed/mhz04/900"),
    ProviderTrack("mock-05", "海边失真", "无声电台", "潮汐档案", duration_ms=232000, genres=["Indie Rock"], artwork_url="https://picsum.photos/seed/mhz05/900"),
    ProviderTrack("mock-06", "Slow Comet", "June Archive", "Distant Rooms", duration_ms=216000, genres=["Folk"], artwork_url="https://picsum.photos/seed/mhz06/900"),
]


class MockMusicProvider(MusicProvider):
    name = "mock"

    async def search_tracks(self, query: str, limit: int = 20) -> list[ProviderTrack]:
        query = query.casefold()
        return [item for item in MOCK_TRACKS if query in f"{item.title} {item.artist}".casefold()][:limit]

    async def get_track(self, provider_track_id: str) -> ProviderTrack:
        return next(item for item in MOCK_TRACKS if item.provider_id == provider_track_id)

    async def get_similar_candidates(self, track: ProviderTrack, limit: int = 100) -> list[ProviderTrack]:
        return [item for item in MOCK_TRACKS if item.provider_id != track.provider_id][:limit]
