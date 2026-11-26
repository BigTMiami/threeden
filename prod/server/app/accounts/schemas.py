"""What the API sends and receives about accounts and sessions."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Client = Literal["web", "ios", "android"]


class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    email: str
    name: str
    created_at: datetime


class SignUpIn(BaseModel):
    name: str = Field(max_length=500, examples=["Rosa Parks"])
    username: str = Field(max_length=100, examples=["rosa.parks"])
    email: str = Field(max_length=500, examples=["rosa@example.com"])
    password: str = Field(max_length=1000, examples=["correct horse battery"])
    client: Client = "web"
    device_name: str | None = Field(default=None, max_length=200)


class SignInIn(BaseModel):
    login: str = Field(max_length=500, description="Username or email", examples=["rosa.parks"])
    password: str = Field(max_length=1000, examples=["correct horse battery"])
    client: Client = "web"
    device_name: str | None = Field(default=None, max_length=200)


class SignedIn(BaseModel):
    account: AccountOut
    # Only for apps (client ios or android): keep it in the Keychain and send it
    # as "Authorization: Bearer <token>". The web gets an httpOnly cookie instead.
    token: str | None = None


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    client: str
    device_name: str
    created_at: datetime
    last_used_at: datetime
    current: bool = False
