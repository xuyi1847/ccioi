import asyncio
import httpx
from app.core.config import Settings
from app.services.apple_token import AppleDeveloperTokenService
from app.services.providers.base import MusicProvider, ProviderTrack


class AppleMusicProvider(MusicProvider):
    name = "appleMusic"

    def __init__(self, settings: Settings, token_service: AppleDeveloperTokenService):
        self.settings = settings
        self.token_service = token_service

    async def _get(self, path: str, params: dict | None = None, user_token: str | None = None) -> dict:
        token, _ = self.token_service.get_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Origin": self.settings.apple_music_origin,
        }
        if user_token:
            headers["Music-User-Token"] = user_token
        async with httpx.AsyncClient(base_url="https://api.music.apple.com", timeout=httpx.Timeout(20, connect=8)) as client:
            for attempt in range(3):
                try:
                    response = await client.get(path, params=params, headers=headers)
                    response.raise_for_status()
                    return response.json()
                except httpx.HTTPStatusError as exc:
                    if exc.response.status_code < 500 and exc.response.status_code != 429:
                        raise
                    if attempt == 2:
                        raise
                except httpx.TransportError:
                    if attempt == 2:
                        raise
                await asyncio.sleep(0.35 * (2 ** attempt))
        raise RuntimeError("Apple Music request failed")

    @staticmethod
    def _map(item: dict) -> ProviderTrack:
        attrs = item.get("attributes", {})
        artwork = (attrs.get("artwork") or {}).get("url")
        play_params = attrs.get("playParams") or {}
        catalog_id = play_params.get("catalogId") or item.get("id")
        metadata = {**attrs, "playbackType": "musickit"}
        return ProviderTrack(str(catalog_id), attrs.get("name", "Unknown"), attrs.get("artistName", "Unknown"), attrs.get("albumName"), attrs.get("isrc"), attrs.get("durationInMillis"), attrs.get("genreNames", []), artwork.replace("{w}", "900").replace("{h}", "900") if artwork else None, metadata)

    async def search_tracks(self, query: str, limit: int = 20) -> list[ProviderTrack]:
        data = await self._get(f"/v1/catalog/{self.settings.apple_music_storefront}/search", {"term": query, "types": "songs", "limit": limit})
        return [self._map(item) for item in data.get("results", {}).get("songs", {}).get("data", [])]

    async def get_track(self, provider_track_id: str) -> ProviderTrack:
        data = await self._get(f"/v1/catalog/{self.settings.apple_music_storefront}/songs/{provider_track_id}")
        return self._map(data["data"][0])

    async def get_similar_candidates(self, track: ProviderTrack, limit: int = 100) -> list[ProviderTrack]:
        return await self.search_tracks(track.artist, limit)

    async def get_personal_candidates(self, user_token: str, limit: int = 100) -> list[ProviderTrack]:
        """Build a private candidate set without persisting the Music User Token."""
        paths = (
            "/v1/me/library/songs",
            "/v1/me/recent/played/tracks",
            "/v1/me/history/heavy-rotation",
        )
        candidates: list[ProviderTrack] = []
        seen: set[str] = set()
        for path in paths:
            try:
                payload = await self._get(path, {"limit": min(limit, 100)}, user_token)
            except httpx.HTTPError:
                continue
            for item in payload.get("data", []):
                if item.get("type") not in {"songs", "library-songs"}:
                    continue
                if item.get("type") == "library-songs" and not (item.get("attributes", {}).get("playParams") or {}).get("catalogId"):
                    continue
                try:
                    track = self._map(item)
                except (KeyError, TypeError, AttributeError):
                    continue
                if track.provider_id in seen:
                    continue
                track.metadata["personalSource"] = path
                candidates.append(track)
                seen.add(track.provider_id)
        return candidates[:limit]
