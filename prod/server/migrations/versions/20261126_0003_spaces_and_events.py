"""Spaces (groups), memberships, events, RSVPs, and invitations (Cycle 4)

Revision ID: 0003
Revises: 0002
Created: 2026-11-26 15:45:17.170325
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "spaces",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("slug", sa.String(length=60), nullable=True),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("visibility", sa.String(length=20), nullable=False),
        sa.Column(
            "permissions",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("kind IN ('group', 'personal', 'blog')", name="kind"),
        sa.CheckConstraint("visibility IN ('private', 'public')", name="visibility"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_table(
        "events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("space_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=10), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("all_day", sa.Boolean(), nullable=False),
        sa.Column("time_zone", sa.String(length=64), nullable=False),
        sa.Column("location", sa.String(length=300), nullable=False),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("color", sa.String(length=20), nullable=False),
        sa.Column("visibility", sa.String(length=10), nullable=False),
        sa.Column("capacity", sa.Integer(), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("kind = 'event' OR visibility = 'group'", name="entries_are_group"),
        sa.CheckConstraint("kind IN ('event', 'entry')", name="kind"),
        sa.CheckConstraint("visibility IN ('group', 'invite', 'public')", name="visibility"),
        sa.CheckConstraint("capacity IS NULL OR capacity > 0", name="capacity"),
        sa.CheckConstraint("ends_at IS NULL OR ends_at >= starts_at", name="ends_after_start"),
        sa.ForeignKeyConstraint(["created_by"], ["accounts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["space_id"], ["spaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("events_space_starts", "events", ["space_id", "starts_at"], unique=False)
    op.create_table(
        "memberships",
        sa.Column("space_id", sa.Uuid(), nullable=False),
        sa.Column("account_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column(
            "joined_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.CheckConstraint("role IN ('owner', 'admin', 'member')", name="role"),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["space_id"], ["spaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("space_id", "account_id"),
    )
    op.create_index(op.f("ix_memberships_account_id"), "memberships", ["account_id"], unique=False)
    op.create_index(
        "memberships_one_owner",
        "memberships",
        ["space_id"],
        unique=True,
        postgresql_where=sa.text("role = 'owner'"),
    )
    op.create_table(
        "event_invitees",
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("account_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("event_id", "account_id"),
    )
    op.create_index(
        op.f("ix_event_invitees_account_id"), "event_invitees", ["account_id"], unique=False
    )
    op.create_table(
        "event_rsvps",
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("account_id", sa.Uuid(), nullable=False),
        sa.Column("answer", sa.String(length=10), nullable=False),
        sa.Column(
            "answered_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("answer IN ('going', 'maybe', 'no')", name="answer"),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("event_id", "account_id"),
    )
    op.create_index(op.f("ix_event_rsvps_account_id"), "event_rsvps", ["account_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_event_rsvps_account_id"), table_name="event_rsvps")
    op.drop_table("event_rsvps")
    op.drop_index(op.f("ix_event_invitees_account_id"), table_name="event_invitees")
    op.drop_table("event_invitees")
    op.drop_index(
        "memberships_one_owner",
        table_name="memberships",
        postgresql_where=sa.text("role = 'owner'"),
    )
    op.drop_index(op.f("ix_memberships_account_id"), table_name="memberships")
    op.drop_table("memberships")
    op.drop_index("events_space_starts", table_name="events")
    op.drop_table("events")
    op.drop_table("spaces")
