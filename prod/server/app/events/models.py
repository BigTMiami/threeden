"""Calendar items (events and plain entries), RSVPs, and invitations.

Mirrors the prototype's item shape (web/js/modules/calendar/calendar-data.js):

    kind        'event' (a gathering with a page and RSVPs) or 'entry'
                (something to remember, like "Rent due": no RSVPs)
    visibility  'group' (the group's members), 'invite' (host and invited),
                or 'public' (anyone). Entries are always 'group'.

All-day items start at midnight in `time_zone` and end at the midnight after
their last day.
"""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.accounts.models import Account
from app.core.db import Base
from app.core.ids import uuid7
from app.spaces.models import Space

ANSWERS = ("going", "maybe", "no")


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (
        CheckConstraint("kind IN ('event', 'entry')", name="kind"),
        CheckConstraint("visibility IN ('group', 'invite', 'public')", name="visibility"),
        CheckConstraint("kind = 'event' OR visibility = 'group'", name="entries_are_group"),
        CheckConstraint("ends_at IS NULL OR ends_at >= starts_at", name="ends_after_start"),
        CheckConstraint("capacity IS NULL OR capacity > 0", name="capacity"),
        Index("events_space_starts", "space_id", "starts_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid7)
    space_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("spaces.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(10), default="event")
    title: Mapped[str] = mapped_column(String(200))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    all_day: Mapped[bool] = mapped_column(default=False)
    time_zone: Mapped[str] = mapped_column(String(64))  # IANA name, e.g. America/Chicago
    location: Mapped[str] = mapped_column(String(300), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    color: Mapped[str] = mapped_column(String(20), default="blue")
    visibility: Mapped[str] = mapped_column(String(10), default="group")
    capacity: Mapped[int | None]
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("accounts.id", ondelete="SET NULL")
    )
    # Goes up when the event itself is edited (not when someone answers).
    version: Mapped[int] = mapped_column(default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    space: Mapped[Space] = relationship(lazy="joined")
    host: Mapped[Account | None] = relationship(lazy="joined")
    rsvps: Mapped[list["EventRsvp"]] = relationship(
        lazy="selectin", cascade="all, delete-orphan", order_by="EventRsvp.answered_at"
    )
    invitees: Mapped[list["EventInvitee"]] = relationship(
        lazy="selectin", cascade="all, delete-orphan"
    )


class EventRsvp(Base):
    __tablename__ = "event_rsvps"
    __table_args__ = (CheckConstraint("answer IN ('going', 'maybe', 'no')", name="answer"),)

    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), primary_key=True
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    answer: Mapped[str] = mapped_column(String(10))
    answered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    account: Mapped[Account] = relationship(lazy="joined")


class EventInvitee(Base):
    __tablename__ = "event_invitees"

    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), primary_key=True
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), primary_key=True, index=True
    )

    account: Mapped[Account] = relationship(lazy="joined")
