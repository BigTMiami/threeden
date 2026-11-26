"""What the API sends and receives about events and RSVPs."""

import uuid
from collections import Counter
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field

from app.events.models import Event
from app.spaces.schemas import Person, SpaceBrief


class Answer(StrEnum):
    going = "going"
    maybe = "maybe"
    no = "no"


class EventKind(StrEnum):
    """An event has a page and RSVPs; an entry is something to remember, like "Rent due"."""

    event = "event"
    entry = "entry"


class EventVisibility(StrEnum):
    group = "group"
    invite = "invite"
    public = "public"


class RsvpOut(BaseModel):
    account: Person
    answer: Answer
    answered_at: datetime


class RsvpCounts(BaseModel):
    going: int
    maybe: int
    no: int


class EventOut(BaseModel):
    """An event or a calendar entry, as the person asking may see it."""

    id: uuid.UUID
    space: SpaceBrief
    kind: EventKind
    title: str
    starts_at: datetime
    ends_at: datetime | None
    all_day: bool
    time_zone: str = Field(description="Where it happens (IANA name); show its times there")
    location: str
    notes: str
    color: str
    visibility: EventVisibility
    capacity: int | None
    host: Person | None
    version: int = Field(description="Send it back with an RSVP; 409 if the event changed since")
    counts: RsvpCounts
    my_answer: Answer | None
    rsvps: list[RsvpOut] = Field(description="Everyone who answered, earliest first")
    invitees: list[Person]


class RsvpIn(BaseModel):
    answer: Answer | None = Field(
        default=None, description="null (or left out) takes your answer back"
    )
    version: int | None = Field(
        default=None, description="The event's version you were looking at, if you know it"
    )


def event_out(event: Event, account_id: uuid.UUID | None) -> EventOut:
    counts = Counter(r.answer for r in event.rsvps)
    mine = next((r.answer for r in event.rsvps if r.account_id == account_id), None)
    return EventOut(
        id=event.id,
        space=SpaceBrief.model_validate(event.space),
        kind=EventKind(event.kind),
        title=event.title,
        starts_at=event.starts_at,
        ends_at=event.ends_at,
        all_day=event.all_day,
        time_zone=event.time_zone,
        location=event.location,
        notes=event.notes,
        color=event.color,
        visibility=EventVisibility(event.visibility),
        capacity=event.capacity,
        host=Person.model_validate(event.host) if event.host else None,
        version=event.version,
        counts=RsvpCounts(going=counts["going"], maybe=counts["maybe"], no=counts["no"]),
        my_answer=Answer(mine) if mine else None,
        rsvps=[
            RsvpOut(
                account=Person.model_validate(r.account),
                answer=Answer(r.answer),
                answered_at=r.answered_at,
            )
            for r in event.rsvps
        ],
        invitees=[Person.model_validate(i.account) for i in event.invitees],
    )
