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


@dataclass(slots=True)
class PlaybackTrack:
    provider_id: str
    title: str
    artist: str
    album: str | None = None
    duration_seconds: float | None = None
    genre: str | None = None
    year: int | None = None
    database_id: int | None = None
    source: str = "mac_music"


@dataclass(slots=True)
class PlaybackState:
    state: str
    position_seconds: float
    track: PlaybackTrack | None


class PlaybackProvider(ABC):
    """Playback boundary, deliberately separate from recommendation/catalog APIs."""

    @abstractmethod
    async def play(self, track: PlaybackTrack) -> None: ...

    @abstractmethod
    async def pause(self) -> None: ...

    @abstractmethod
    async def resume(self) -> None: ...

    @abstractmethod
    async def next(self) -> None: ...

    @abstractmethod
    async def get_current_track(self) -> PlaybackTrack | None: ...

    @abstractmethod
    async def get_player_state(self) -> PlaybackState: ...
