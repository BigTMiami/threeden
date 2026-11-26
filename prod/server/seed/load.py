"""Load the demo groups into the database (development only). `make seed` runs it.

Reads the JSON that seed/export.mjs prints (from stdin, or a file named as
the argument). Every id is a fixed UUID made from the prototype's id, so
loading again updates the same rows instead of adding new ones: people,
groups, memberships, and calendar items are brought up to date (dates move
with today), and RSVPs are added only where that person hasn't answered, so
answers given while testing are kept.

Demo accounts get the password in DEMO_PASSWORD (default 3den-demo) when
they're first made.
"""

import json
import os
import sys
import uuid
from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.accounts.models import Account
from app.auth.passwords import hash_password
from app.core.db import SessionLocal
from app.core.settings import get_settings
from app.events.models import Event, EventInvitee, EventRsvp
from app.spaces.models import Membership, Space

# Fixed, so the same prototype id always becomes the same UUID.
NAMESPACE = uuid.UUID("5d3c1e0a-7b1f-4c55-9a43-3de0de0de001")
DEFAULT_PASSWORD = "3den-demo"


def id_for(key: str) -> uuid.UUID:
    return uuid.uuid5(NAMESPACE, key)


def times_of(item: dict[str, Any], zone: ZoneInfo) -> tuple[datetime, datetime]:
    """starts_at and ends_at. All-day: midnight to the midnight after the last day."""
    start_day = date.fromisoformat(item["date"])
    end_day = date.fromisoformat(item["endDate"] or item["date"])
    if item["allDay"]:
        return (
            datetime.combine(start_day, time(0), zone),
            datetime.combine(end_day + timedelta(days=1), time(0), zone),
        )
    starts = datetime.combine(start_day, time.fromisoformat(item["time"]), zone)
    ends = datetime.combine(end_day, time.fromisoformat(item["endTime"] or item["time"]), zone)
    return starts, max(starts, ends)


def upsert(
    db: Session, model: type, rows: list[dict[str, Any]], keys: list[str], update: list[str]
) -> None:
    if not rows:
        return
    statement = insert(model).values(rows)
    if update:
        statement = statement.on_conflict_do_update(
            index_elements=keys, set_={name: statement.excluded[name] for name in update}
        )
    else:
        statement = statement.on_conflict_do_nothing(index_elements=keys)
    db.execute(statement)


def load(db: Session, data: dict[str, Any], password: str = DEFAULT_PASSWORD) -> dict[str, int]:
    """Write the demo data; returns how many of each thing it covers."""
    zone = ZoneInfo(data["timeZone"])

    # People: a password only for new accounts.
    existing = set(
        db.scalars(
            select(Account.id).where(Account.id.in_([id_for(p["key"]) for p in data["people"]]))
        )
    )
    password_hash = hash_password(password)
    upsert(
        db,
        Account,
        [
            {
                "id": id_for(p["key"]),
                "username": p["username"],
                "email": p["email"],
                "name": p["name"],
                "password_hash": password_hash,
            }
            for p in data["people"]
        ],
        ["id"],
        ["username", "email", "name"],
    )

    items = 0
    for space in data["spaces"]:
        space_id = id_for(space["key"])
        upsert(
            db,
            Space,
            [
                {
                    "id": space_id,
                    "slug": space["key"],
                    "kind": space["kind"],
                    "name": space["name"],
                    "description": space["description"],
                    "visibility": space["visibility"],
                    "permissions": space["permissions"],
                }
            ],
            ["id"],
            ["slug", "kind", "name", "description", "visibility", "permissions"],
        )
        upsert(
            db,
            Membership,
            [
                {"space_id": space_id, "account_id": id_for(m["key"]), "role": m["role"]}
                for m in space["members"]
            ],
            ["space_id", "account_id"],
            ["role"],
        )
        for item in space["events"]:
            event_id = id_for(item["key"])
            starts_at, ends_at = times_of(item, zone)
            upsert(
                db,
                Event,
                [
                    {
                        "id": event_id,
                        "space_id": space_id,
                        "kind": item["kind"],
                        "title": item["title"],
                        "starts_at": starts_at,
                        "ends_at": ends_at,
                        "all_day": item["allDay"],
                        "time_zone": data["timeZone"],
                        "location": item["location"],
                        "notes": item["notes"],
                        "color": item["color"],
                        "visibility": item["visibility"],
                        "capacity": item["capacity"],
                        "created_by": id_for(item["createdBy"]) if item["createdBy"] else None,
                    }
                ],
                ["id"],
                [
                    "space_id", "kind", "title", "starts_at", "ends_at", "all_day", "time_zone",
                    "location", "notes", "color", "visibility", "capacity", "created_by",
                ],
            )  # fmt: skip
            upsert(
                db,
                EventInvitee,
                [{"event_id": event_id, "account_id": id_for(key)} for key in item["inviteeIds"]],
                ["event_id", "account_id"],
                [],
            )
            upsert(
                db,
                EventRsvp,
                [
                    {"event_id": event_id, "account_id": id_for(key), "answer": answer}
                    for key, answer in item["rsvps"].items()
                ],
                ["event_id", "account_id"],
                [],
            )
            items += 1
    db.commit()
    return {
        "people": len(data["people"]),
        "new_people": len(data["people"]) - len(existing),
        "groups": len(data["spaces"]),
        "items": items,
    }


def main() -> None:
    if not get_settings().is_development:
        sys.exit("The demo data is for development only (APP_ENV=development).")
    if len(sys.argv) > 1:
        with open(sys.argv[1]) as file:
            data = json.load(file)
    else:
        data = json.load(sys.stdin)
    password = os.environ.get("DEMO_PASSWORD") or DEFAULT_PASSWORD
    with SessionLocal() as db:
        try:
            counts = load(db, data, password)
        except IntegrityError as error:
            sys.exit(
                "Couldn't load the demo data: a username or email it uses is already taken by "
                f"another account.\n{error.orig}"
            )
    names = ", ".join(s["name"] for s in data["spaces"])
    print(
        f"Demo data loaded: {counts['groups']} groups ({names}), {counts['items']} calendar items, "
        f"{counts['people']} people ({counts['new_people']} new)."
    )
    usernames = ", ".join(p["username"] for p in data["people"])
    print(f"Sign in as any of {usernames} with the password {password}.")


if __name__ == "__main__":
    main()
