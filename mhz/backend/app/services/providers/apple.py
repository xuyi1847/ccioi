import httpx
from app.core.config import Settings
from app.services.apple_token import AppleDeveloperTokenService
from app.services.providers.base import MusicProvider, ProviderTrack


class AppleMusicProvider(MusicProvider):
    name = "appleMusic"

    def __init__(self, settings: Settings, token_service: AppleDeveloperTokenService):
        self.settings = settings
        self.token_service = token_service

    async def _get(self, path: str, params: dict | None = None) -> dict:
        token, _ = self.token_service.get_token()
        async with httpx.AsyncClient(base_url="https://api.music.apple.com", timeout=15) as client:
            response = await client.get(path, params=params, headers={"Authorization": f"Bearer {token}"})
            response.raise_for_status()
            return response.json()

    @staticmethod
    def _map(item: dict) -> ProviderTrack:
        attrs = item.get("attributes", {})
        artwork = attrs.get("artwork", {}).get("url")
        return ProviderTrack(str(item["id"]), attrs.get("name", "Unknown"), attrs.get("artistName", "Unknown"), attrs.get("albumName"), attrs.get("isrc"), attrs.get("durationInMillis"), attrs.get("genreNames", []), artwork.replace("{w}", "900").replace("{h}", "900") if artwork else None, attrs)

    async def search_tracks(self, query: str, limit: int = 20) -> list[ProviderTrack]:
        data = await self._get(f"/v1/catalog/{self.settings.apple_music_storefront}/search", {"term": query, "types": "songs", "limit": limit})
        return [self._map(item) for item in data.get("results", {}).get("songs", {}).get("data", [])]

    async def get_track(self, provider_track_id: str) -> ProviderTrack:
        data = await self._get(f"/v1/catalog/{self.settings.apple_music_storefront}/songs/{provider_track_id}")
        return self._map(data["data"][0])

    async def get_similar_candidates(self, track: ProviderTrack, limit: int = 100) -> list[ProviderTrack]:
        return await self.search_tracks(track.artist, limit)
