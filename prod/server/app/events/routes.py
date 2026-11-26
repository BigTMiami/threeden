"""One event, and answering it (RSVP)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.sessions import CurrentAuth, MaybeAuth
from app.core.db import get_db
from app.events.models import Event, EventRsvp
from app.events.schemas import EventOut, RsvpIn, event_out
from app.events.visibility import visible_to
from app.spaces.schemas import errors

router = APIRouter(prefix="/api/v1/events", tags=["events"])

DB = Annotated[Session, Depends(get_db)]

NOT_FOUND = "This event doesn’t exist, or it’s private."
CHANGED = "This event changed since you opened it. Have a look, then answer again."
FULL = "It’s full."
ENTRY = "This is a calendar entry, not an event, so it doesn’t take RSVPs."


def _visible_event(
    db: Session, event_id: uuid.UUID, account_id: uuid.UUID | None, *, lock: bool = False
) -> Event:
    """The event, if this person may see it; 404 otherwise (whether or not it exists)."""
    query = select(Event).where(Event.id == event_id, visible_to(account_id))
    if lock:
        # Answers to one event take turns, so two people can't both take its last spot.
        query = query.with_for_update(of=Event)
    event = db.scalar(query)
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    return event


@router.get("/{event_id}", responses=errors(404))
def read_event(event_id: uuid.UUID, auth: MaybeAuth, db: DB) -> EventOut:
    """One event: details, host, counts, your answer, and who answered.

    Public events are open to everyone, even someone not signed in.
    """
    account_id = auth.account.id if auth else None
    return event_out(_visible_event(db, event_id, account_id), account_id)


@router.put("/{event_id}/rsvp", responses=errors(400, 401, 404, 409))
def answer_event(event_id: uuid.UUID, body: RsvpIn, auth: CurrentAuth, db: DB) -> EventOut:
    """Going, Maybe, or Can't go (`null` takes your answer back). Returns the event.

    409 if `version` is out of date (the event changed since you looked) or
    it's full; 400 for a calendar entry.
    """
    me = auth.account.id
    event = _visible_event(db, event_id, me, lock=True)
    if event.kind != "event":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=ENTRY)
    if body.version is not None and body.version != event.version:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=CHANGED)

    mine = next((r for r in event.rsvps if r.account_id == me), None)
    if (
        body.answer == "going"
        and event.capacity is not None
        and (mine is None or mine.answer != "going")
    ):
        going = sum(1 for r in event.rsvps if r.answer == "going")
        if going >= event.capacity:
            raise HTTPException(status.HTTP_409_CONFLICT, detail=FULL)

    if body.answer is None:
        if mine is not None:
            event.rsvps.remove(mine)
    elif mine is None:
        event.rsvps.append(EventRsvp(account_id=me, answer=body.answer))
    elif mine.answer != body.answer:
        mine.answer = body.answer
        mine.answered_at = func.now()  # type: ignore[assignment]
    db.commit()
    db.expire_all()
    return event_out(_visible_event(db, event_id, me), me)
