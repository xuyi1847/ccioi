"""initial MHz schema"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    json_type = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")
    op.create_table("users", sa.Column("id", sa.Uuid(), primary_key=True), sa.Column("anonymous_id", sa.String(64), nullable=False, unique=True), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()), sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    op.create_table("channels", sa.Column("id", sa.String(64), primary_key=True), sa.Column("frequency", sa.Numeric(4, 1), nullable=False), sa.Column("name", sa.String(128), nullable=False), sa.Column("channel_type", sa.String(32), nullable=False), sa.Column("config", json_type, nullable=False), sa.Column("active", sa.Boolean(), default=True), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    op.create_table("tracks", sa.Column("id", sa.Uuid(), primary_key=True), sa.Column("title", sa.String(512), nullable=False), sa.Column("artist_name", sa.String(512), nullable=False), sa.Column("album_name", sa.String(512)), sa.Column("isrc", sa.String(32)), sa.Column("duration_ms", sa.Integer()), sa.Column("release_date", sa.Date()), sa.Column("genre", json_type, nullable=False), sa.Column("metadata", json_type, nullable=False), sa.Column("popularity", sa.Float(), default=0), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()), sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    op.create_index("idx_tracks_isrc", "tracks", ["isrc"])
    bigint_pk = sa.BigInteger().with_variant(sa.Integer(), "sqlite")
    op.create_table("track_providers", sa.Column("id", bigint_pk, primary_key=True, autoincrement=True), sa.Column("track_id", sa.Uuid(), sa.ForeignKey("tracks.id", ondelete="CASCADE"), nullable=False), sa.Column("provider", sa.String(32), nullable=False), sa.Column("provider_track_id", sa.String(128), nullable=False), sa.Column("storefront", sa.String(16)), sa.Column("provider_metadata", json_type, nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()), sa.UniqueConstraint("provider", "provider_track_id", "storefront"))
    op.create_table("user_track_events", sa.Column("id", bigint_pk, primary_key=True, autoincrement=True), sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("track_id", sa.Uuid(), sa.ForeignKey("tracks.id", ondelete="CASCADE"), nullable=False), sa.Column("channel_id", sa.String(64), sa.ForeignKey("channels.id")), sa.Column("recommendation_id", sa.Uuid()), sa.Column("event_type", sa.String(32), nullable=False), sa.Column("play_duration_ms", sa.Integer()), sa.Column("track_duration_ms", sa.Integer()), sa.Column("position", sa.Integer()), sa.Column("context", json_type, nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    op.create_index("idx_event_user_time", "user_track_events", ["user_id", "created_at"])
    op.create_index("idx_event_track", "user_track_events", ["track_id"])


def downgrade() -> None:
    op.drop_table("user_track_events")
    op.drop_table("track_providers")
    op.drop_table("tracks")
    op.drop_table("channels")
    op.drop_table("users")
