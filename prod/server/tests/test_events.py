"""Groups, their events, and RSVPs: who sees what, and answering.

The setup, like the demo: Leo owns 14 Juniper Lane (private), where Maya is
an admin; Grace runs Eastside Mutual Aid (public), where Leo is a member.
Olive is in neither.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.accounts.models import Account
from app.auth.sessions import create_session
from app.events.models import Event, EventInvitee, EventRsvp
from app.spaces.models import Membership, Space

SOON = datetime.now(UTC).replace(microsecond=0) + timedelta(days=3)


@dataclass
class World:
    people: dict[str, Account]
    tokens: dict[str, str]
    juniper: Space
    aid: Space
    meeting: Event  # Juniper, group event, hosted by Maya
    rent: Event  # Juniper, a calendar entry
    party: Event  # Juniper, invite-only, hosted by Leo, Maya invited
    pantry: Event  # Aid, public
    volunteers: Event  # Aid, group only
    sorting: Event  # Aid, public, room for 2

    def auth(self, who: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.tokens[who]}"}


def _event(space: Space, title: str, **fields) -> Event:
    return Event(
        space_id=space.id,
        title=title,
        starts_at=fields.pop("starts_at", SOON),
        ends_at=fields.pop("ends_at", SOON + timedelta(hours=2)),
        time_zone="America/New_York",
        **fields,
    )


@pytest.fixture
def world(db: Session) -> World:
    people = {
        name: Account(
            username=name, email=f"{name}@example.com", name=name.title(), password_hash="x"
        )
        for name in ["leo", "maya", "grace", "olive"]
    }
    db.add_all(people.values())
    db.flush()
    juniper = Space(slug="juniper", name="14 Juniper Lane", visibility="private")
    aid = Space(slug="mutualaid", name="Eastside Mutual Aid", visibility="public")
    db.add_all([juniper, aid])
    db.flush()
    db.add_all(
        [
            Membership(space_id=juniper.id, account_id=people["leo"].id, role="owner"),
            Membership(space_id=juniper.id, account_id=people["maya"].id, role="admin"),
            Membership(space_id=aid.id, account_id=people["grace"].id, role="owner"),
            Membership(space_id=aid.id, account_id=people["leo"].id, role="member"),
        ]
    )
    meeting = _event(juniper, "House meeting", created_by=people["maya"].id)
    rent = _event(
        juniper,
        "Rent due",
        kind="entry",
        all_day=True,
        starts_at=SOON + timedelta(days=10),
        ends_at=SOON + timedelta(days=11),
    )
    party = _event(juniper, "Surprise party", visibility="invite", created_by=people["leo"].id)
    pantry = _event(aid, "Saturday free pantry", visibility="public", created_by=people["grace"].id)
    volunteers = _event(aid, "Volunteer meeting", created_by=people["grace"].id)
    sorting = _event(
        aid,
        "Coat sorting party",
        visibility="public",
        capacity=2,
        starts_at=SOON + timedelta(days=20),
        ends_at=SOON + timedelta(days=20, hours=2),
    )
    db.add_all([meeting, rent, party, pantry, volunteers, sorting])
    db.flush()
    db.add_all(
        [
            EventInvitee(event_id=party.id, account_id=people["maya"].id),
            EventRsvp(event_id=meeting.id, account_id=people["maya"].id, answer="going"),
            EventRsvp(event_id=sorting.id, account_id=people["grace"].id, answer="going"),
        ]
    )
    db.commit()
    tokens = {name: create_session(db, account, "ios", "test") for name, account in people.items()}
    db.commit()
    return World(people, tokens, juniper, aid, meeting, rent, party, pantry, volunteers, sorting)


def titles(response) -> list[str]:
    assert response.status_code == 200, response.text
    return [e["title"] for e in response.json()]


def rsvp(client: TestClient, world: World, who: str, event: Event, answer: str | None, **extra):
    return client.put(
        f"/api/v1/events/{event.id}/rsvp", json={"answer": answer, **extra}, headers=world.auth(who)
    )


# ─── Your groups ──────────────────────────────────────────────────────────────


def test_my_spaces(client: TestClient, world: World) -> None:
    spaces = client.get("/api/v1/me/spaces", headers=world.auth("leo")).json()
    assert [(s["name"], s["role"], s["member_count"]) for s in spaces] == [
        ("14 Juniper Lane", "owner", 2),
        ("Eastside Mutual Aid", "member", 2),
    ]
    assert spaces[0]["slug"] == "juniper"
    assert client.get("/api/v1/me/spaces", headers=world.auth("olive")).json() == []
    assert client.get("/api/v1/me/spaces").status_code == 401


def test_members(client: TestClient, world: World) -> None:
    members = client.get(
        f"/api/v1/spaces/{world.juniper.id}/members", headers=world.auth("maya")
    ).json()
    assert [(m["account"]["username"], m["role"]) for m in members] == [
        ("leo", "owner"),
        ("maya", "admin"),
    ]


def test_members_are_for_members(client: TestClient, world: World) -> None:
    olive = world.auth("olive")
    private = client.get(f"/api/v1/spaces/{world.juniper.id}/members", headers=olive)
    assert private.status_code == 404  # a private group doesn't admit it exists
    public = client.get(f"/api/v1/spaces/{world.aid.id}/members", headers=olive)
    assert public.status_code == 403
    assert public.json()["detail"] == "Only members can see who’s in this group."


# ─── Who sees which events ───────────────────────────────────────────────────


def test_members_see_their_groups_events(client: TestClient, world: World) -> None:
    url = f"/api/v1/spaces/{world.juniper.id}/events"
    future = {"to": (SOON + timedelta(days=30)).isoformat()}
    assert titles(client.get(url, params=future, headers=world.auth("leo"))) == [
        "House meeting", "Surprise party", "Rent due"
    ]  # fmt: skip
    # Maya is invited to the party.
    assert "Surprise party" in titles(client.get(url, params=future, headers=world.auth("maya")))


def test_invite_only_is_hidden_from_other_members(
    client: TestClient, world: World, db: Session
) -> None:
    db.add(Membership(space_id=world.juniper.id, account_id=world.people["grace"].id))
    db.commit()
    url = f"/api/v1/spaces/{world.juniper.id}/events"
    assert titles(client.get(url, headers=world.auth("grace"))) == ["House meeting", "Rent due"]
    assert (
        client.get(f"/api/v1/events/{world.party.id}", headers=world.auth("grace")).status_code
        == 404
    )


def test_non_members_get_404_for_a_private_group(client: TestClient, world: World) -> None:
    olive = world.auth("olive")
    response = client.get(f"/api/v1/spaces/{world.juniper.id}/events", headers=olive)
    assert response.status_code == 404
    assert response.json()["detail"] == "There’s no such group, or it’s private."
    for event in [world.meeting, world.rent, world.party]:
        response = client.get(f"/api/v1/events/{event.id}", headers=olive)
        assert response.status_code == 404
        assert response.json()["detail"] == "This event doesn’t exist, or it’s private."


def test_a_missing_event_looks_the_same_as_a_private_one(client: TestClient, world: World) -> None:
    response = client.get(f"/api/v1/events/{uuid.uuid4()}", headers=world.auth("olive"))
    assert response.status_code == 404
    assert response.json()["detail"] == "This event doesn’t exist, or it’s private."


def test_public_events_are_visible_to_everyone(client: TestClient, world: World) -> None:
    url = f"/api/v1/spaces/{world.aid.id}/events"
    future = {"to": (SOON + timedelta(days=30)).isoformat()}
    everything = ["Saturday free pantry", "Volunteer meeting", "Coat sorting party"]
    assert titles(client.get(url, params=future, headers=world.auth("leo"))) == everything
    public = ["Saturday free pantry", "Coat sorting party"]
    assert titles(client.get(url, params=future, headers=world.auth("olive"))) == public
    assert titles(client.get(url, params=future)) == public  # not signed in
    visitor = client.get(f"/api/v1/events/{world.pantry.id}")
    assert visitor.status_code == 200
    assert visitor.json()["my_answer"] is None
    assert client.get(f"/api/v1/events/{world.volunteers.id}").status_code == 404


def test_the_event_page(client: TestClient, world: World) -> None:
    event = client.get(f"/api/v1/events/{world.meeting.id}", headers=world.auth("leo")).json()
    assert event["title"] == "House meeting"
    assert event["space"]["name"] == "14 Juniper Lane"
    assert event["host"]["username"] == "maya"
    assert event["counts"] == {"going": 1, "maybe": 0, "no": 0}
    assert [(r["account"]["username"], r["answer"]) for r in event["rsvps"]] == [("maya", "going")]
    assert event["my_answer"] is None
    assert event["time_zone"] == "America/New_York"
    assert event["version"] == 1


def test_time_range(client: TestClient, world: World) -> None:
    url = f"/api/v1/spaces/{world.juniper.id}/events"
    leo = world.auth("leo")
    # By default, the next 60 days from now; an event under way still counts.
    later = {"from": (SOON + timedelta(days=5)).isoformat()}
    assert titles(client.get(url, params=later, headers=leo)) == ["Rent due"]
    under_way = {
        "from": (SOON + timedelta(hours=1)).isoformat(),
        "to": (SOON + timedelta(days=1)).isoformat(),
    }
    assert titles(client.get(url, params=under_way, headers=leo)) == [
        "House meeting",
        "Surprise party",
    ]
    backwards = {"from": SOON.isoformat(), "to": (SOON - timedelta(days=1)).isoformat()}
    assert client.get(url, params=backwards, headers=leo).status_code == 400
    too_long = {"from": SOON.isoformat(), "to": (SOON + timedelta(days=500)).isoformat()}
    assert client.get(url, params=too_long, headers=leo).status_code == 400


# ─── RSVPs ────────────────────────────────────────────────────────────────────


def test_an_rsvp_changes_the_counts(client: TestClient, world: World) -> None:
    response = rsvp(client, world, "leo", world.meeting, "going", version=1)
    assert response.status_code == 200, response.text
    event = response.json()
    assert event["counts"] == {"going": 2, "maybe": 0, "no": 0}
    assert event["my_answer"] == "going"

    event = rsvp(client, world, "leo", world.meeting, "maybe").json()
    assert event["counts"] == {"going": 1, "maybe": 1, "no": 0}

    # Maya sees Leo's answer.
    seen = client.get(f"/api/v1/events/{world.meeting.id}", headers=world.auth("maya")).json()
    assert seen["counts"] == {"going": 1, "maybe": 1, "no": 0}
    assert seen["my_answer"] == "going"
    assert {r["account"]["username"]: r["answer"] for r in seen["rsvps"]} == {
        "maya": "going",
        "leo": "maybe",
    }


def test_taking_an_answer_back(client: TestClient, world: World) -> None:
    rsvp(client, world, "leo", world.meeting, "no")
    event = rsvp(client, world, "leo", world.meeting, None).json()
    assert event["counts"] == {"going": 1, "maybe": 0, "no": 0}
    assert event["my_answer"] is None
    # Taking back an answer you never gave is fine too.
    assert rsvp(client, world, "leo", world.meeting, None).status_code == 200


def test_a_stale_version_gets_409(client: TestClient, world: World, db: Session) -> None:
    world.meeting.version = 2  # someone moved the meeting
    db.commit()
    response = rsvp(client, world, "leo", world.meeting, "going", version=1)
    assert response.status_code == 409
    assert (
        response.json()["detail"]
        == "This event changed since you opened it. Have a look, then answer again."
    )
    assert rsvp(client, world, "leo", world.meeting, "going", version=2).status_code == 200


def test_a_full_event_refuses_going(client: TestClient, world: World) -> None:
    assert rsvp(client, world, "leo", world.sorting, "going").status_code == 200  # 2 of 2
    response = rsvp(client, world, "olive", world.sorting, "going")
    assert response.status_code == 409
    assert response.json()["detail"] == "It’s full."
    # Maybe is always open, and someone already going can say so again.
    assert rsvp(client, world, "olive", world.sorting, "maybe").status_code == 200
    assert rsvp(client, world, "leo", world.sorting, "going").status_code == 200


def test_calendar_entries_take_no_rsvps(client: TestClient, world: World) -> None:
    response = rsvp(client, world, "leo", world.rent, "going")
    assert response.status_code == 400
    assert "doesn’t take RSVPs" in response.json()["detail"]


def test_answering_needs_sign_in_and_access(client: TestClient, world: World) -> None:
    assert (
        client.put(f"/api/v1/events/{world.pantry.id}/rsvp", json={"answer": "going"}).status_code
        == 401
    )
    assert rsvp(client, world, "olive", world.meeting, "going").status_code == 404
    assert rsvp(client, world, "grace", world.party, "going").status_code == 404


def test_anyone_can_answer_a_public_event(client: TestClient, world: World) -> None:
    event = rsvp(client, world, "olive", world.pantry, "going").json()
    assert event["my_answer"] == "going"


def test_answering_from_the_web_needs_origin(browser: TestClient, world: World) -> None:
    browser.cookies.set("threeden_session", world.tokens["leo"])
    url = f"/api/v1/events/{world.meeting.id}/rsvp"
    assert browser.put(url, json={"answer": "going"}).status_code == 200
    assert (
        browser.put(
            url, json={"answer": "going"}, headers={"Origin": "https://evil.example"}
        ).status_code
        == 403
    )
