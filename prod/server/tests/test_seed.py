"""The demo-data loader (seed/load.py), with a small hand-made export."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.accounts.models import Account
from app.auth.passwords import check_password
from app.events.models import Event, EventRsvp
from app.spaces.models import Membership, Space
from seed.load import id_for, load

DATA = {
    "timeZone": "America/Chicago",
    "people": [
        {"key": "m-leo", "name": "Leo L", "username": "leo", "email": "leo@example.com"},
        {"key": "m-maya", "name": "Maya Chen", "username": "maya", "email": "maya@example.com"},
    ],
    "spaces": [
        {
            "key": "juniper",
            "kind": "group",
            "name": "14 Juniper Lane",
            "description": "The house.",
            "visibility": "private",
            "permissions": {},
            "members": [{"key": "m-leo", "role": "owner"}, {"key": "m-maya", "role": "admin"}],
            "events": [
                {
                    "key": "house-ev-2", "kind": "event", "title": "House meeting",
                    "date": "2026-12-01", "endDate": "2026-12-01", "allDay": False,
                    "time": "19:00", "endTime": "20:30", "repeat": "none", "location": "Hall",
                    "notes": "", "color": "blue", "visibility": "group", "capacity": None,
                    "createdBy": "m-maya", "inviteeIds": [], "rsvps": {"m-maya": "going"},
                },
                {
                    "key": "house-ev-5", "kind": "entry", "title": "Maya away",
                    "date": "2026-12-04", "endDate": "2026-12-06", "allDay": True,
                    "time": "", "endTime": "", "repeat": "none", "location": "",
                    "notes": "", "color": "purple", "visibility": "group", "capacity": None,
                    "createdBy": "m-maya", "inviteeIds": [], "rsvps": {},
                },
            ],
        }
    ],
}  # fmt: skip


def count(db: Session, model) -> int:
    return db.scalar(select(func.count()).select_from(model)) or 0


def test_load_twice_changes_nothing_new(db: Session) -> None:
    first = load(db, DATA, "demo-password")
    assert first == {"people": 2, "new_people": 2, "groups": 1, "items": 2}
    # Leo answers while testing; loading again keeps it.
    db.add(EventRsvp(event_id=id_for("house-ev-2"), account_id=id_for("m-leo"), answer="maybe"))
    db.commit()

    second = load(db, DATA, "another-password")
    assert second["new_people"] == 0
    assert [count(db, m) for m in (Account, Space, Membership, Event, EventRsvp)] == [2, 1, 2, 2, 2]
    leo = db.get(Account, id_for("m-leo"))
    assert leo is not None and check_password("demo-password", leo.password_hash)  # not reset


def test_times_are_in_the_time_zone(db: Session) -> None:
    load(db, DATA, "demo-password")
    meeting = db.get(Event, id_for("house-ev-2"))
    away = db.get(Event, id_for("house-ev-5"))
    assert meeting is not None and away is not None
    assert meeting.starts_at.isoformat() == "2026-12-02T01:00:00+00:00"  # 7pm in Chicago
    assert meeting.time_zone == "America/Chicago"
    # All day, Dec 4–6: midnight to the midnight after the last day.
    assert (away.starts_at.isoformat(), away.ends_at and away.ends_at.isoformat()) == (
        "2026-12-04T06:00:00+00:00",
        "2026-12-07T06:00:00+00:00",
    )
