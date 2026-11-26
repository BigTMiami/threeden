"""You: /api/v1/me, and your signed-in devices."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.accounts.schemas import AccountOut, SessionOut
from app.auth.models import AuthSession
from app.auth.sessions import CurrentAuth, clear_session_cookie, live_sessions, revoke
from app.core.db import get_db

router = APIRouter(prefix="/api/v1/me", tags=["me"])

DB = Annotated[Session, Depends(get_db)]


@router.get("")
def read_me(auth: CurrentAuth) -> AccountOut:
    """The signed-in account."""
    return AccountOut.model_validate(auth.account)


@router.get("/sessions")
def read_sessions(auth: CurrentAuth, db: DB) -> list[SessionOut]:
    """Your signed-in devices, most recently used first. `current` is this one."""
    return [
        SessionOut.model_validate(s).model_copy(update={"current": s.id == auth.session.id})
        for s in live_sessions(db, auth.account.id)
    ]


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(session_id: uuid.UUID, auth: CurrentAuth, db: DB) -> Response:
    """Sign out one of your devices (this one too, if you pick it)."""
    session = db.get(AuthSession, session_id)
    if session is None or session.account_id != auth.account.id or session.revoked_at:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="No such session.")
    revoke(db, session)
    db.commit()
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    if session.id == auth.session.id:
        clear_session_cookie(response)
    return response
