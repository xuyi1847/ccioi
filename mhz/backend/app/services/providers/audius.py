from typing import Any
import asyncio
import re

import httpx

from app.core.config import Settings
from app.services.providers.base import MusicProvider, ProviderTrack


class AudiusProvider(MusicProvider):
    name = "audius"
    base_url = "https://api.audius.co/v1"

    def __init__(self, settings: Settings):
        self.app_name = settings.audius_app_name

    async def _get(self, path: str, **params: Any) -> Any:
        async with httpx.AsyncClient(base_url=self.base_url, timeout=20, follow_redirects=True) as client:
            response = await client.get(path, params={"app_name": self.app_name, **params})
            response.raise_for_status()
            payload = response.json()
        if "data" not in payload:
            raise RuntimeError(payload.get("message") or "Audius API request failed")
        return payload["data"]

    def _map(self, item: dict[str, Any]) -> ProviderTrack:
        artwork = item.get("artwork") or {}
        user = item.get("user") or {}
        raw_tags = item.get("tags") or ""
        tags = [tag.strip() for tag in raw_tags.split(",") if tag.strip()]
        genre = item.get("genre")
        genres = [genre] if genre else []
        track_id = str(item["id"])
        return ProviderTrack(
            provider_id=track_id,
            title=item.get("title") or "Unknown",
            artist=user.get("name") or user.get("handle") or "Unknown",
            album=None,
            isrc=item.get("isrc") or None,
            duration_ms=int(item["duration"]) * 1000 if item.get("duration") else None,
            genres=genres,
            artwork_url=artwork.get("1000x1000") or artwork.get("480x480") or None,
            metadata={
                "artistId": str(item.get("user_id") or "") or None,
                "streamUrl": f"{self.base_url}/tracks/{track_id}/stream?app_name={self.app_name}",
                "tags": list(dict.fromkeys(genres + tags)),
                "mood": item.get("mood"),
                "playCount": item.get("play_count") or 0,
                "permalink": item.get("permalink"),
                "providerUrl": f"https://audius.co{item['permalink']}" if item.get("permalink") else "https://audius.co",
            },
        )

    @staticmethod
    def _playable_song(item: dict[str, Any]) -> bool:
        duration = int(item.get("duration") or 0)
        return item.get("is_streamable", True) and 30 <= duration <= 900

    @staticmethod
    def _is_chinese_song(item: dict[str, Any]) -> bool:
        if (item.get("genre") or "").casefold() in {"podcasts", "spoken word"}:
            return False
        text = str(item.get("title") or "")
        user = item.get("user") or {}
        text += " " + str(user.get("name") or "")
        return bool(re.search(r"[\u3400-\u9fff]", text))

    async def search_tracks(self, query: str, limit: int = 20) -> list[ProviderTrack]:
        data = await self._get("/tracks/search", query=query, limit=limit)
        return [self._map(item) for item in data if self._playable_song(item)]

    async def get_trending_tracks(self, limit: int = 100) -> list[ProviderTrack]:
        data = await self._get("/tracks/trending", limit=limit)
        return [self._map(item) for item in data if self._playable_song(item)]

    async def get_chinese_tracks(self, limit: int = 100) -> list[ProviderTrack]:
        queries = ("中文", "华语", "Mandarin", "粤语")
        pages = await asyncio.gather(*(self._get("/tracks/search", query=query, limit=50) for query in queries))
        result: list[ProviderTrack] = []
        seen: set[str] = set()
        artist_counts: dict[str, int] = {}
        for page in pages:
            for item in page:
                track_id = str(item.get("id") or "")
                if not track_id or track_id in seen or not self._playable_song(item) or not self._is_chinese_song(item):
                    continue
                artist_id = str(item.get("user_id") or (item.get("user") or {}).get("id") or "unknown")
                if artist_counts.get(artist_id, 0) >= 3:
                    continue
                mapped = self._map(item)
                mapped.metadata["language"] = "zh"
                result.append(mapped)
                seen.add(track_id)
                artist_counts[artist_id] = artist_counts.get(artist_id, 0) + 1
                if len(result) >= limit:
                    return result
        return result

    async def get_tracks_by_artist(self, artist_id: str, limit: int = 50) -> list[ProviderTrack]:
        data = await self._get(f"/users/{artist_id}/tracks", limit=limit)
        return [self._map(item) for item in data if self._playable_song(item)]

    async def get_track(self, provider_track_id: str) -> ProviderTrack:
        data = await self._get(f"/tracks/{provider_track_id}")
        return self._map(data)

    async def get_similar_candidates(self, track: ProviderTrack, limit: int = 100) -> list[ProviderTrack]:
        if track.genres:
            return await self.search_tracks(track.genres[0], limit)
        artist_id = track.metadata.get("artistId")
        if artist_id:
            return await self.get_tracks_by_artist(str(artist_id), limit)
        return await self.get_trending_tracks(limit)
