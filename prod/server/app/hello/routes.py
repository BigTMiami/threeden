"""Hello World: read and add greetings, to prove the whole path works."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.hello.models import MESSAGE_MAX, Greeting

router = APIRouter(prefix="/api/v1/hello", tags=["hello"])

LATEST = 5

Message = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MESSAGE_MAX)
]


class GreetingIn(BaseModel):
    message: Message = Field(examples=["Hello from the desktop"])


class GreetingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    message: str
    created_at: datetime


class HelloOut(BaseModel):
    count: int
    latest: list[GreetingOut]


DB = Annotated[Session, Depends(get_db)]


@router.get("")
def read_hello(db: DB) -> HelloOut:
    """How many greetings there are, and the latest five (newest first)."""
    count = db.scalar(select(func.count()).select_from(Greeting)) or 0
    latest = db.scalars(
        select(Greeting).order_by(Greeting.created_at.desc(), Greeting.id.desc()).limit(LATEST)
    ).all()
    return HelloOut(count=count, latest=[GreetingOut.model_validate(g) for g in latest])


@router.post("", status_code=status.HTTP_201_CREATED)
def add_hello(body: GreetingIn, db: DB) -> GreetingOut:
    """Add a greeting (1 to 200 characters, after trimming spaces)."""
    greeting = Greeting(message=body.message)
    db.add(greeting)
    db.commit()
    db.refresh(greeting)
    return GreetingOut.model_validate(greeting)
