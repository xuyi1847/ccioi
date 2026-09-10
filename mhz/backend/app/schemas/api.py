import uuid
from typing import Any, Literal
from pydantic import BaseModel, Field

EventType = Literal["impression", "play_start", "play_30s", "play_complete", "skip", "dislike", "favorite", "unfavorite", "replay"]


class AnonymousUserOut(BaseModel):
    user_id: uuid.UUID = Field(alias="userId")
    model_config = {"populate_by_name": True}


class ChannelOut(BaseModel):
    id: str
    frequency: float
    name: str
    channel_type: str = Field(alias="channelType")
    config: dict[str, Any]
    model_config = {"from_attributes": True, "populate_by_name": True}


class EventIn(BaseModel):
    user_id: uuid.UUID = Field(alias="userId")
    track_id: uuid.UUID = Field(alias="trackId")
    channel_id: str | None = Field(None, alias="channelId")
    recommendation_id: uuid.UUID | None = Field(None, alias="recommendationId")
    event_type: EventType = Field(alias="eventType")
    play_duration_ms: int | None = Field(None, alias="playDurationMs", ge=0)
    track_duration_ms: int | None = Field(None, alias="trackDurationMs", ge=0)
    position: int | None = None
    context: dict[str, Any] = Field(default_factory=dict)
    model_config = {"populate_by_name": True}


class RecommendationIn(BaseModel):
    user_id: uuid.UUID = Field(alias="userId")
    channel_id: str = Field(alias="channelId")
    exclude_track_ids: list[uuid.UUID] = Field(default_factory=list, alias="excludeTrackIds")
    model_config = {"populate_by_name": True}


class ProviderOut(BaseModel):
    name: str
    track_id: str = Field(alias="trackId")
    model_config = {"populate_by_name": True}


class TrackOut(BaseModel):
    id: uuid.UUID
    title: str
    artist: str
    album: str | None
    artwork_url: str | None = Field(None, alias="artworkUrl")
    duration_ms: int | None = Field(None, alias="durationMs")
    stream_url: str | None = Field(None, alias="streamUrl")
    license_url: str | None = Field(None, alias="licenseUrl")
    provider_url: str | None = Field(None, alias="providerUrl")
    provider: ProviderOut
    model_config = {"populate_by_name": True}


class ReasonOut(BaseModel):
    type: str
    confidence: float


class RecommendationOut(BaseModel):
    recommendation_id: uuid.UUID = Field(alias="recommendationId")
    track: TrackOut
    reason: ReasonOut
    model_config = {"populate_by_name": True}
