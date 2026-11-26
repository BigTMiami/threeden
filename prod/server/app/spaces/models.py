"""Spaces (groups for now; personal homepages and blogs later) and who's in them."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.accounts.models import Account
from app.core.db import Base
from app.core.ids import uuid7


class Space(Base):
    __tablename__ = "spaces"
    __table_args__ = (
        CheckConstraint("kind IN ('group', 'personal', 'blog')", name="kind"),
        CheckConstraint("visibility IN ('private', 'public')", name="visibility"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid7)
    # The prototype's id for seeded spaces ('juniper'); empty for spaces made on the server.
    slug: Mapped[str | None] = mapped_column(String(60), unique=True)
    kind: Mapped[str] = mapped_column(String(20), default="group")
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text, default="")
    visibility: Mapped[str] = mapped_column(String(20), default="private")
    # Only the permissions this space changed: { permissionId: lowest role }.
    permissions: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb")
    )
    version: Mapped[int] = mapped_column(default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (
        CheckConstraint("role IN ('owner', 'admin', 'member')", name="role"),
        # One owner per space.
        Index(
            "memberships_one_owner",
            "space_id",
            unique=True,
            postgresql_where=text("role = 'owner'"),
        ),
    )

    space_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("spaces.id", ondelete="CASCADE"), primary_key=True
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    role: Mapped[str] = mapped_column(String(20), default="member")
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    account: Mapped[Account] = relationship(lazy="joined")
