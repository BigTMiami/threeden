"""What the API sends about spaces and their members."""

import uuid
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict


class Role(StrEnum):
    owner = "owner"
    admin = "admin"
    member = "member"


class SpaceKind(StrEnum):
    group = "group"
    personal = "personal"
    blog = "blog"


class SpaceVisibility(StrEnum):
    private = "private"
    public = "public"


class Person(BaseModel):
    """Someone, as others see them."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    username: str


class SpaceBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str | None
    kind: SpaceKind
    name: str
    visibility: SpaceVisibility


class SpaceOut(SpaceBrief):
    """One of your groups."""

    description: str
    role: Role
    member_count: int


class MemberOut(BaseModel):
    account: Person
    role: Role
    joined_at: datetime


class ErrorOut(BaseModel):
    """Every refusal: a sentence to show the person."""

    detail: str


def errors(*codes: int) -> dict[int | str, dict]:
    """OpenAPI `responses` for these error codes, so generated clients can read them."""
    return {code: {"model": ErrorOut} for code in codes}
