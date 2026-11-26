"""Who can see which events: the server's canViewEvent (web/js/state/events.js).

    public  → anyone, even someone not signed in
    group   → the group's members (entries are always 'group')
    invite  → the host and the people invited
    and in every case: the host, and anyone invited or who has answered.

It's a WHERE clause, so queries only ever ask for rows the person may see
(docs/architecture.md §8.2: scoped, not filtered afterwards).
"""

import uuid

from sqlalchemy import ColumnElement, and_, exists, or_

from app.events.models import Event, EventInvitee, EventRsvp
from app.spaces.models import Membership


def visible_to(account_id: uuid.UUID | None) -> ColumnElement[bool]:
    """Events this person can see; None means someone not signed in."""
    public = Event.visibility == "public"
    if account_id is None:
        return public
    member = exists().where(
        Membership.space_id == Event.space_id, Membership.account_id == account_id
    )
    invited = exists().where(
        EventInvitee.event_id == Event.id, EventInvitee.account_id == account_id
    )
    answered = exists().where(EventRsvp.event_id == Event.id, EventRsvp.account_id == account_id)
    return or_(
        public,
        Event.created_by == account_id,
        invited,
        answered,
        and_(Event.visibility == "group", member),
    )
