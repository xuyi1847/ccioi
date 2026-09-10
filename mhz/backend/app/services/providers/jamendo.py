from typing import Any

import httpx

from app.core.config import Settings
from app.services.providers.base import MusicProvider, ProviderTrack


class JamendoProvider(MusicProvider):
    name = "jamendo"
    base_url = "https://api.jamendo.com/v3.0"

    def __init__(self, settings: Settings):
        if not settings.jamendo_client_id:
            raise ValueError(
                "JAMENDO_CLIENT_ID is not configured. Create a free Jamendo developer application; "
                "the former public test client 709fa152 is suspended."
            )
        self.client_id = settings.jamendo_client_id

    async def _tracks(self, **params: Any) -> list[ProviderTrack]:
        request_params = {
            "client_id": self.client_id,
            "format": "json",
            "audioformat": "mp32",
            "include": "musicinfo",
            **params,
        }
        async with httpx.AsyncClient(base_url=self.base_url, timeout=20, follow_redirects=True) as client:
            response = await client.get("/tracks/", params=request_params)
            response.raise_for_status()
            payload = response.json()
        headers = payload.get("headers", {})
        if headers.get("status") != "success":
            raise RuntimeError(headers.get("error_message") or "Jamendo API request failed")
        return [self._map(item) for item in payload.get("results", []) if item.get("audio")]

    @staticmethod
    def _map(item: dict[str, Any]) -> ProviderTrack:
        musicinfo = item.get("musicinfo") or {}
        tags = musicinfo.get("tags") or {}
        genres = [str(value) for value in tags.get("genres", [])]
        all_tags = list(dict.fromkeys(genres + [str(value) for value in tags.get("vartags", [])]))
        return ProviderTrack(
            provider_id=str(item["id"]),
            title=item.get("name") or "Unknown",
            artist=item.get("artist_name") or "Unknown",
            album=item.get("album_name") or None,
            duration_ms=int(float(item["duration"]) * 1000) if item.get("duration") else None,
            genres=genres,
            artwork_url=item.get("album_image") or item.get("image") or None,
            metadata={
                "artistId": str(item.get("artist_id") or "") or None,
                "streamUrl": item["audio"],
                "licenseUrl": item.get("license_ccurl") or None,
                "tags": all_tags,
            },
        )

    async def search_tracks(self, query: str, limit: int = 20) -> list[ProviderTrack]:
        return await self._tracks(namesearch=query, limit=limit, order="relevance")

    async def get_tracks_by_tags(self, tags: list[str], limit: int = 100) -> list[ProviderTrack]:
        return await self._tracks(tags=" ".join(tags), limit=limit, order="popularity_total")

    async def get_tracks_by_artist(self, artist_id: str, limit: int = 50) -> list[ProviderTrack]:
        return await self._tracks(artist_id=artist_id, limit=limit, order="popularity_total")

    async def get_popular_tracks(self, limit: int = 100) -> list[ProviderTrack]:
        return await self._tracks(limit=limit, order="popularity_total")

    async def get_track(self, provider_track_id: str) -> ProviderTrack:
        tracks = await self._tracks(id=provider_track_id, limit=1)
        if not tracks:
            raise LookupError(f"Jamendo track {provider_track_id} was not found")
        return tracks[0]

    async def get_similar_candidates(self, track: ProviderTrack, limit: int = 100) -> list[ProviderTrack]:
        if track.genres:
            return await self.get_tracks_by_tags(track.genres[:2], limit)
        artist_id = track.metadata.get("artistId")
        if artist_id:
            return await self.get_tracks_by_artist(str(artist_id), limit)
        return await self.get_popular_tracks(limit)
