import asyncio
from typing import Any
from urllib.parse import quote_plus

import httpx

from app.core.config import Settings
from app.services.providers.base import MusicProvider, ProviderTrack


class MusicBrainzProvider(MusicProvider):
    """Open music metadata provider. It deliberately does not provide audio."""

    name = "musicbrainz"
    base_url = "https://musicbrainz.org/ws/2"

    def __init__(self, settings: Settings):
        self.user_agent = settings.musicbrainz_user_agent

    async def _get(self, path: str, **params: Any) -> dict[str, Any]:
        async with httpx.AsyncClient(
            base_url=self.base_url,
            headers={"User-Agent": self.user_agent, "Accept": "application/json"},
            timeout=25,
            follow_redirects=True,
        ) as client:
            for attempt in range(3):
                response = await client.get(path, params={"fmt": "json", **params})
                if response.status_code not in {429, 503}:
                    response.raise_for_status()
                    return response.json()
                if attempt < 2:
                    await asyncio.sleep(float(response.headers.get("Retry-After", "1")))
            response.raise_for_status()
            raise RuntimeError("MusicBrainz request failed")

    @staticmethod
    def _artist_name(item: dict[str, Any]) -> str:
        credits = item.get("artist-credit") or []
        return "".join(
            f"{credit.get('name') or (credit.get('artist') or {}).get('name', '')}{credit.get('joinphrase', '')}"
            for credit in credits
        ).strip() or "Unknown artist"

    @staticmethod
    def _links(title: str, artist: str) -> dict[str, str]:
        query = quote_plus(f"{title} {artist}")
        return {
            "appleMusic": f"https://music.apple.com/cn/search?term={query}",
            "qqMusic": f"https://y.qq.com/n/ryqq/search?w={query}",
            "netease": f"https://music.163.com/#/search/m/?s={query}&type=1",
        }

    def _map(self, item: dict[str, Any]) -> ProviderTrack:
        releases = item.get("releases") or []
        release = next((entry for entry in releases if entry.get("status") == "Official"), releases[0] if releases else {})
        release_id = release.get("id")
        genres = [entry["name"] for entry in item.get("genres") or [] if entry.get("name")]
        if not genres:
            genres = [entry["name"] for entry in item.get("tags") or [] if entry.get("name")][:8]
        artist = self._artist_name(item)
        title = item.get("title") or "Unknown title"
        first_release_date = item.get("first-release-date") or None
        return ProviderTrack(
            provider_id=str(item["id"]),
            title=title,
            artist=artist,
            album=release.get("title"),
            isrc=(item.get("isrcs") or [None])[0],
            duration_ms=item.get("length"),
            genres=genres,
            artwork_url=(f"https://coverartarchive.org/release/{release_id}/front-500" if release_id else None),
            metadata={
                "releaseId": release_id,
                "firstReleaseDate": first_release_date,
                "score": item.get("score", 0),
                "playbackType": "external",
                "externalLinks": self._links(title, artist),
                "dataLicense": "MusicBrainz core data (CC0)",
            },
        )

    async def search_tracks(self, query: str, limit: int = 20) -> list[ProviderTrack]:
        payload = await self._get("/recording", query=query, limit=limit)
        tracks: list[ProviderTrack] = []
        seen: set[tuple[str, str]] = set()
        rejected_versions = ("live", "karaoke", "tribute", "bootleg", "demo")
        for item in payload.get("recordings", []):
            releases = item.get("releases") or []
            if releases and not any(entry.get("status") == "Official" for entry in releases):
                continue
            if any(word in (item.get("disambiguation") or "").casefold() for word in rejected_versions):
                continue
            track = self._map(item)
            key = (track.title.casefold(), track.artist.casefold())
            if key in seen:
                continue
            seen.add(key)
            tracks.append(track)
        return tracks

    async def get_track(self, provider_track_id: str) -> ProviderTrack:
        payload = await self._get(f"/recording/{provider_track_id}", inc="artists+releases+isrcs+genres+tags")
        return self._map(payload)

    async def get_similar_candidates(self, track: ProviderTrack, limit: int = 100) -> list[ProviderTrack]:
        terms = [f'artist:"{track.artist}"']
        if track.genres:
            terms.append(f'tag:"{track.genres[0]}"')
        return await self.search_tracks(" OR ".join(terms), limit)
