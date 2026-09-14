"""scope recommendation candidates to ccioi users"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bigint_pk = sa.BigInteger().with_variant(sa.Integer(), "sqlite")
    op.create_table(
        "user_track_candidates",
        sa.Column("id", bigint_pk, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("track_id", sa.Uuid(), sa.ForeignKey("tracks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source", sa.String(64), nullable=False, server_default="apple"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "track_id"),
    )
    op.create_index("idx_user_candidates_user", "user_track_candidates", ["user_id"])
    op.create_index("idx_user_candidates_track", "user_track_candidates", ["track_id"])


def downgrade() -> None:
    op.drop_table("user_track_candidates")
