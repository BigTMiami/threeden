"""Your groups, their members, and their calendars."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.sessions import CurrentAuth, MaybeAuth
from app.core.db import get_db
from app.events.models import Event
from app.events.schemas import EventOut, event_out
from app.events.visibility import visible_to
from app.spaces.models import Membership, Space
from app.spaces.schemas import (
    MemberOut,
    Person,
    Role,
    SpaceKind,
    SpaceOut,
    SpaceVisibility,
    errors,
)

router = APIRouter(prefix="/api/v1", tags=["spaces"])

DB = Annotated[Session, Depends(get_db)]

DEFAULT_RANGE = timedelta(days=60)
LONGEST_RANGE = timedelta(days=400)
MOST_EVENTS = 500

NOT_FOUND = "There’s no such group, or it’s private."


def _role(db: Session, space_id: uuid.UUID, account_id: uuid.UUID | None) -> str | None:
    if account_id is None:
        return None
    return db.scalar(
        select(Membership.role).where(
            Membership.space_id == space_id, Membership.account_id == account_id
        )
    )


def _space_for(
    db: Session, space_id: uuid.UUID, account_id: uuid.UUID | None
) -> tuple[Space, str | None]:
    """The space and the person's role in it. A private space is 404 to outsiders."""
    space = db.get(Space, space_id)
    role = _role(db, space_id, account_id) if space else None
    if space is None or (space.visibility == "private" and role is None):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    return space, role


@router.get("/me/spaces", responses=errors(401))
def my_spaces(auth: CurrentAuth, db: DB) -> list[SpaceOut]:
    """Your groups, by name, with your role and how many people are in each."""
    counts = (
        select(Membership.space_id, func.count().label("n"))
        .group_by(Membership.space_id)
        .subquery()
    )
    rows = db.execute(
        select(Space, Membership.role, counts.c.n)
        .join(Membership, Membership.space_id == Space.id)
        .join(counts, counts.c.space_id == Space.id)
        .where(Membership.account_id == auth.account.id)
        .order_by(func.lower(Space.name))
    ).all()
    return [
        SpaceOut(
            id=space.id,
            slug=space.slug,
            kind=SpaceKind(space.kind),
            name=space.name,
            visibility=SpaceVisibility(space.visibility),
            description=space.description,
            role=Role(role),
            member_count=n,
        )
        for space, role, n in rows
    ]


@router.get("/spaces/{space_id}/members", responses=errors(401, 403, 404))
def space_members(space_id: uuid.UUID, auth: CurrentAuth, db: DB) -> list[MemberOut]:
    """Who's in a group (members only), the owner and admins first, then by name."""
    _, role = _space_for(db, space_id, auth.account.id)
    if role is None:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, detail="Only members can see who’s in this group."
        )
    rank = {"owner": 0, "admin": 1, "member": 2}
    memberships = db.scalars(select(Membership).where(Membership.space_id == space_id)).all()
    memberships = sorted(memberships, key=lambda m: (rank[m.role], m.account.name.lower()))
    return [
        MemberOut(
            account=Person.model_validate(m.account), role=Role(m.role), joined_at=m.joined_at
        )
        for m in memberships
    ]


@router.get("/spaces/{space_id}/events", responses=errors(404))
def space_events(
    space_id: uuid.UUID,
    auth: MaybeAuth,
    db: DB,
    start: Annotated[datetime | None, Query(alias="from", description="Default: now")] = None,
    end: Annotated[
        datetime | None, Query(alias="to", description="Default: 60 days after `from`")
    ] = None,
) -> list[EventOut]:
    """A group's events and calendar entries in a time range that you can see, soonest first.

    Anything that overlaps the range counts (it started before `from` but
    hasn't ended). A public group's public events are open to everyone.
    """
    account_id = auth.account.id if auth else None
    _space_for(db, space_id, account_id)
    start = _utc(start) if start else datetime.now(UTC)
    end = _utc(end) if end else start + DEFAULT_RANGE
    if end <= start or end - start > LONGEST_RANGE:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Pick a range up to 400 days long, with `to` after `from`.",
        )
    events = db.scalars(
        select(Event)
        .where(
            Event.space_id == space_id,
            Event.starts_at < end,
            func.coalesce(Event.ends_at, Event.starts_at) >= start,
            visible_to(account_id),
        )
        .order_by(Event.starts_at, Event.title)
        .limit(MOST_EVENTS)
    ).all()
    return [event_out(e, account_id) for e in events]


def _utc(moment: datetime) -> datetime:
    """A time without a zone is taken as UTC."""
    return moment if moment.tzinfo else moment.replace(tzinfo=UTC)
