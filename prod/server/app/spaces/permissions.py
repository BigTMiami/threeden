"""Who can do what in a space: the server's can().

The roles and permissions come from prod/shared/permissions.json, the same
file the web app reads (web/js/state/permissions.js), and both run the cases
in shared/permission-cases.json. The client's checks only decide what to
show; these are the ones that count.
"""

import json
from functools import cache
from pathlib import Path
from typing import Any

# /srv/server/app/spaces/permissions.py → /srv/shared (compose mounts prod/shared there).
SHARED_DIR = Path(__file__).resolve().parents[3] / "shared"

SINGLE_OWNER_KINDS = {"personal", "blog"}


@cache
def table() -> dict[str, Any]:
    return json.loads((SHARED_DIR / "permissions.json").read_text())


def ranks() -> dict[str, int]:
    return {role["id"]: role["rank"] for role in table()["roles"]}


def required_role(space_permissions: dict[str, str] | None, permission_id: str) -> str:
    """The lowest role allowed to do it in this space."""
    permission = next((p for p in table()["permissions"] if p["id"] == permission_id), None)
    if permission is None:
        raise ValueError(f'Unknown permission: "{permission_id}"')
    return (space_permissions or {}).get(permission_id, permission["defaultRole"])


def at_least(role: str | None, minimum: str) -> bool:
    """`at_least("owner", "admin")` is True."""
    r = ranks()
    return r.get(role or "", 0) >= r.get(minimum, 10**9)


def effective_role(space_kind: str, role: str | None) -> str | None:
    """Someone's role, given their membership role (None = not a member)."""
    if role is None:
        return None
    return "owner" if space_kind in SINGLE_OWNER_KINDS else role


def can(
    space_kind: str, space_permissions: dict[str, str] | None, role: str | None, permission_id: str
) -> bool:
    """May someone with this membership role do this in this space?"""
    actual = effective_role(space_kind, role)
    return actual is not None and at_least(actual, required_role(space_permissions, permission_id))
