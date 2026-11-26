"""prod/shared/openapi.json (what the iOS app's types are made from) matches the API."""

from app.openapi import spec_text
from app.spaces.permissions import SHARED_DIR


def test_shared_openapi_is_up_to_date() -> None:
    saved = (SHARED_DIR / "openapi.json").read_text()
    assert saved == spec_text(), "The API changed: run `make openapi` (then `make ios`)."
