"""Making, finding, and ending sessions; and who's asking (the `Auth` dependency)."""

import hashlib
import re
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.accounts.models import Account
from app.auth.models import AuthSession
from app.core.db import get_db
from app.core.settings import get_settings

# last_used_at is updated at most this often, so reading doesn't always write.
TOUCH_EVERY = timedelta(minutes=5)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(db: Session, account: Account, client: str, device_name: str) -> str:
    """Start a session and return its token (shown once, never stored)."""
    token = secrets.token_urlsafe(32)
    now = datetime.now(UTC)
    db.add(
        AuthSession(
            account_id=account.id,
            token_hash=hash_token(token),
            client=client,
            device_name=device_name[:100],
            created_at=now,
            last_used_at=now,
            expires_at=now + timedelta(days=get_settings().session_days),
        )
    )
    return token


def find_session(db: Session, token: str) -> AuthSession | None:
    """The live session for this token: not revoked, not expired."""
    found = db.scalar(select(AuthSession).where(AuthSession.token_hash == hash_token(token)))
    if found is None or found.revoked_at is not None or found.expires_at <= datetime.now(UTC):
        return None
    return found


def live_sessions(db: Session, account_id: uuid.UUID) -> list[AuthSession]:
    return list(
        db.scalars(
            select(AuthSession)
            .where(
                AuthSession.account_id == account_id,
                AuthSession.revoked_at.is_(None),
                AuthSession.expires_at > datetime.now(UTC),
            )
            .order_by(AuthSession.last_used_at.desc())
        )
    )


def revoke(db: Session, session: AuthSession) -> None:
    if session.revoked_at is None:
        session.revoked_at = datetime.now(UTC)


# ─── Cookies (web) ──────────────────────────────────────────────────────────


def set_session_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        settings.session_cookie_name,
        token,
        max_age=settings.session_days * 24 * 60 * 60,
        path="/",
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )


def clear_session_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        settings.session_cookie_name,
        path="/",
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )


# ─── Who's asking ───────────────────────────────────────────────────────────


def token_from(request: Request) -> str | None:
    """The bearer token (apps) or, failing that, the session cookie (web)."""
    header = request.headers.get("authorization", "")
    scheme, _, value = header.partition(" ")
    if scheme.lower() == "bearer" and value.strip():
        return value.strip()
    return request.cookies.get(get_settings().session_cookie_name)


@dataclass
class Auth:
    account: Account
    session: AuthSession


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Please sign in.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def current_auth(request: Request, db: Annotated[Session, Depends(get_db)]) -> Auth:
    token = token_from(request)
    session = find_session(db, token) if token else None
    if session is None:
        raise _unauthorized()
    now = datetime.now(UTC)
    if now - session.last_used_at > TOUCH_EVERY:
        session.last_used_at = now
        db.commit()
    return Auth(account=session.account, session=session)


CurrentAuth = Annotated[Auth, Depends(current_auth)]


# ─── Device names ───────────────────────────────────────────────────────────

_BROWSERS = [
    ("Edg/", "Edge"),
    ("Firefox/", "Firefox"),
    ("Chrome/", "Chrome"),
    ("Safari/", "Safari"),
]
_SYSTEMS = [
    ("iPhone", "iPhone"),
    ("iPad", "iPad"),
    ("Android", "Android"),
    ("Mac OS X", "Mac"),
    ("Windows", "Windows"),
    ("Linux", "Linux"),
]


def device_name_from_user_agent(user_agent: str) -> str:
    """'Safari on Mac', 'Chrome on Android', … or 'A web browser'."""
    browser = next((name for key, name in _BROWSERS if key in user_agent), None)
    system = next((name for key, name in _SYSTEMS if key in user_agent), None)
    if browser and system:
        return f"{browser} on {system}"
    return browser or system or "A web browser"


def clean_device_name(name: str | None) -> str | None:
    if not name:
        return None
    name = re.sub(r"\s+", " ", name).strip()
    return name[:100] or None
