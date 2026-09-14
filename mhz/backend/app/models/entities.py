import uuid
from datetime import date, datetime
from typing import Any
from sqlalchemy import BigInteger, Boolean, Date, DateTime, Float, ForeignKey, Integer, JSON, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import JSONB
from app.models.base import Base, TimestampMixin

BIGINT_PK = BigInteger().with_variant(Integer, "sqlite")
JSON_TYPE = JSON().with_variant(JSONB, "postgresql")


class User(Base, TimestampMixin):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    anonymous_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)


class UserTrackCandidate(Base):
    __tablename__ = "user_track_candidates"
    __table_args__ = (UniqueConstraint("user_id", "track_id"),)
    id: Mapped[int] = mapped_column(BIGINT_PK, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    track_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tracks.id", ondelete="CASCADE"), index=True)
    source: Mapped[str] = mapped_column(String(64), default="apple")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Track(Base, TimestampMixin):
    __tablename__ = "tracks"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(512))
    artist_name: Mapped[str] = mapped_column(String(512), index=True)
    album_name: Mapped[str | None] = mapped_column(String(512))
    isrc: Mapped[str | None] = mapped_column(String(32), index=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    release_date: Mapped[date | None] = mapped_column(Date)
    genre: Mapped[list[str]] = mapped_column(JSON_TYPE, default=list)
    metadata_json: Mapped[dict[str, Any]] = mapped_column("metadata", JSON_TYPE, default=dict)
    popularity: Mapped[float] = mapped_column(Float, default=0)
    providers: Mapped[list["TrackProvider"]] = relationship(back_populates="track", lazy="selectin")


class TrackProvider(Base):
    __tablename__ = "track_providers"
    __table_args__ = (UniqueConstraint("provider", "provider_track_id", "storefront"),)
    id: Mapped[int] = mapped_column(BIGINT_PK, primary_key=True, autoincrement=True)
    track_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tracks.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(32))
    provider_track_id: Mapped[str] = mapped_column(String(128))
    storefront: Mapped[str | None] = mapped_column(String(16))
    provider_metadata: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    track: Mapped[Track] = relationship(back_populates="providers")


class Channel(Base):
    __tablename__ = "channels"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    frequency: Mapped[float] = mapped_column(Numeric(4, 1))
    name: Mapped[str] = mapped_column(String(128))
    channel_type: Mapped[str] = mapped_column(String(32))
    config: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UserTrackEvent(Base):
    __tablename__ = "user_track_events"
    id: Mapped[int] = mapped_column(BIGINT_PK, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    track_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tracks.id", ondelete="CASCADE"), index=True)
    channel_id: Mapped[str | None] = mapped_column(ForeignKey("channels.id"))
    recommendation_id: Mapped[uuid.UUID | None] = mapped_column(index=True)
    event_type: Mapped[str] = mapped_column(String(32), index=True)
    play_duration_ms: Mapped[int | None] = mapped_column(Integer)
    track_duration_ms: Mapped[int | None] = mapped_column(Integer)
    position: Mapped[int | None] = mapped_column(Integer)
    context: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
