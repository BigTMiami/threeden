"""Sign up, sign in, sign out: /api/v1/auth/…"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.accounts import rules
from app.accounts.models import Account
from app.accounts.schemas import AccountOut, SignedIn, SignInIn, SignUpIn
from app.auth import passwords
from app.auth.sessions import (
    clean_device_name,
    clear_session_cookie,
    create_session,
    device_name_from_user_agent,
    find_session,
    revoke,
    set_session_cookie,
    token_from,
)
from app.core import ratelimit
from app.core.db import get_db

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

DB = Annotated[Session, Depends(get_db)]

WRONG_LOGIN = "That username or email and password don’t match."


def client_ip(request: Request) -> str:
    # Uvicorn takes this from Caddy's X-Forwarded-For (FORWARDED_ALLOW_IPS in compose.yaml).
    return request.client.host if request.client else "unknown"


def _start(
    db: Session,
    request: Request,
    response: Response,
    account: Account,
    client: str,
    device_name: str | None,
) -> SignedIn:
    if client == "web":
        name = clean_device_name(device_name) or device_name_from_user_agent(
            request.headers.get("user-agent", "")
        )
    else:
        name = clean_device_name(device_name) or f"3den app ({client})"
    token = create_session(db, account, client, name)
    db.commit()
    out = AccountOut.model_validate(account)
    if client == "web":
        set_session_cookie(response, token)
        return SignedIn(account=out)
    return SignedIn(account=out, token=token)


def _unprocessable(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=detail)


@router.post("/signup", status_code=status.HTTP_201_CREATED)
def sign_up(body: SignUpIn, request: Request, response: Response, db: DB) -> SignedIn:
    """Make an account and sign in as it."""
    ratelimit.signup_by_ip.hit(client_ip(request))

    name = " ".join(body.name.split())
    username = rules.normalize_username(body.username)
    email = body.email.strip()
    problem = (
        rules.name_problem(name)
        or rules.username_problem(username)
        or rules.email_problem(email)
        or rules.password_problem(body.password)
    )
    if problem:
        raise _unprocessable(problem)

    if db.scalar(select(Account.id).where(Account.username == username)):
        raise HTTPException(status.HTTP_409_CONFLICT, detail=f"@{username} is taken.")
    if db.scalar(select(Account.id).where(func.lower(Account.email) == email.lower())):
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="There’s already an account with that email."
        )

    account = Account(
        name=name,
        username=username,
        email=email,
        password_hash=passwords.hash_password(body.password),
    )
    db.add(account)
    db.flush()
    return _start(db, request, response, account, body.client, body.device_name)


@router.post("/signin")
def sign_in(body: SignInIn, request: Request, response: Response, db: DB) -> SignedIn:
    """Sign in with a username (or @username) or email, and a password."""
    login = rules.normalize_username(body.login)
    ratelimit.signin_by_ip.hit(client_ip(request))
    ratelimit.signin_by_login.hit(login)

    account = db.scalar(
        select(Account).where(or_(Account.username == login, func.lower(Account.email) == login))
    )
    # Checked even when there's no account, so both take the same time.
    if not passwords.check_password(body.password, account.password_hash if account else None):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail=WRONG_LOGIN)
    assert account is not None

    if passwords.needs_rehash(account.password_hash):
        account.password_hash = passwords.hash_password(body.password)
    return _start(db, request, response, account, body.client, body.device_name)


@router.post("/signout", status_code=status.HTTP_204_NO_CONTENT)
def sign_out(request: Request, db: DB) -> Response:
    """End this device's session. Other devices stay signed in. Fine to call twice."""
    token = token_from(request)
    session = find_session(db, token) if token else None
    if session is not None:
        revoke(db, session)
        db.commit()
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_session_cookie(response)
    return response
