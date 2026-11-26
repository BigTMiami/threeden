"""The shared can() cases (prod/shared/permission-cases.json), against the server's can().
web/tests/permissions.test.js runs the same cases against the web app's."""

import json

import pytest

from app.spaces.permissions import SHARED_DIR, at_least, can, required_role, table

CASES = json.loads((SHARED_DIR / "permission-cases.json").read_text())["cases"]


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_shared_case(case: dict) -> None:
    space = case["space"]
    assert (
        can(space["kind"], space.get("permissions"), case["as"], case["permission"])
        is case["expect"]
    )


def test_every_case_names_a_real_permission() -> None:
    ids = {p["id"] for p in table()["permissions"]}
    assert {c["permission"] for c in CASES} <= ids


def test_unknown_permission_is_an_error() -> None:
    with pytest.raises(ValueError):
        required_role({}, "launchRockets")


def test_ranks() -> None:
    assert at_least("owner", "admin")
    assert not at_least("member", "admin")
    assert not at_least(None, "member")
