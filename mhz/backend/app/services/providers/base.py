from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class ProviderTrack:
    provider_id: str
    title: str
    artist: str
    album: str | None = None
    isrc: str | None = None
    duration_ms: int | None = None
    genres: list[str] = field(default_factory=list)
    artwork_url: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


class MusicProvider(ABC):
    name: str

    @abstractmethod
    async def search_tracks(self, query: str, limit: int = 20) -> list[ProviderTrack]: ...

    @abstractmethod
    async def get_track(self, provider_track_id: str) -> ProviderTrack: ...

    @abstractmethod
    async def get_similar_candidates(self, track: ProviderTrack, limit: int = 100) -> list[ProviderTrack]: ...
