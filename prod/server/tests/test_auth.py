"""Sign up, sign in, sign out, /me, and your devices: what works, and what's refused."""

import hashlib
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.accounts.models import Account
from app.auth.models import AuthSession
from app.auth.sessions import device_name_from_user_agent
from app.core.ids import uuid7
from app.core.settings import get_settings

COOKIE = get_settings().session_cookie_name
ROSA = {
    "name": "Rosa Parks",
    "username": "rosa.parks",
    "email": "Rosa@Example.com",
    "password": "correct horse battery",
}


def sign_up(c: TestClient, client: str = "web", **changes) -> dict:
    response = c.post("/api/v1/auth/signup", json={**ROSA, **changes, "client": client})
    assert response.status_code == 201, response.text
    return response.json()


def sign_in(
    c: TestClient,
    login: str = "rosa.parks",
    password: str = ROSA["password"],
    client: str = "web",
    **extra,
):
    return c.post(
        "/api/v1/auth/signin",
        json={"login": login, "password": password, "client": client, **extra},
    )


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ─── Sign up ────────────────────────────────────────────────────────────────


def test_sign_up_on_the_web_sets_an_httponly_cookie(browser: TestClient) -> None:
    response = browser.post("/api/v1/auth/signup", json=ROSA)
    assert response.status_code == 201
    body = response.json()
    assert body["token"] is None  # the web never sees the token
    assert body["account"]["username"] == "rosa.parks"
    assert body["account"]["email"] == "Rosa@Example.com"
    assert "password" not in str(body).lower()

    set_cookie = response.headers["set-cookie"]
    assert set_cookie.startswith(f"{COOKIE}=")
    assert "HttpOnly" in set_cookie
    assert "samesite=lax" in set_cookie.lower()

    me = browser.get("/api/v1/me")
    assert me.status_code == 200
    assert me.json()["name"] == "Rosa Parks"


def test_sign_up_from_the_app_returns_a_token(client: TestClient) -> None:
    body = sign_up(client, client="ios", device_name="Rosa’s iPhone")
    assert body["token"]
    assert COOKIE not in client.cookies

    me = client.get("/api/v1/me", headers=bearer(body["token"]))
    assert me.status_code == 200
    assert me.json()["username"] == "rosa.parks"


def test_password_is_stored_as_argon2id(client: TestClient, db: Session) -> None:
    sign_up(client)
    account = db.scalar(select(Account))
    assert account is not None
    assert account.password_hash.startswith("$argon2id$")
    assert ROSA["password"] not in account.password_hash


def test_ids_are_uuid7(client: TestClient) -> None:
    account_id = uuid.UUID(sign_up(client)["account"]["id"])
    assert account_id.version == 7
    assert uuid7() > account_id  # later ones sort after


def test_username_is_tidied(client: TestClient) -> None:
    body = sign_up(client, username="@Rosa.Parks ")
    assert body["account"]["username"] == "rosa.parks"


@pytest.mark.parametrize(
    ("changes", "message"),
    [
        ({"name": "   "}, "Add your name."),
        ({"username": "ro"}, "Use 3–20 lowercase letters, numbers, dots, or underscores."),
        ({"username": "rosa parks"}, "Use 3–20 lowercase letters, numbers, dots, or underscores."),
        ({"email": "rosa"}, "That doesn’t look like an email address."),
        ({"password": "short"}, "Use at least 8 characters."),
    ],
)
def test_sign_up_refuses_bad_fields(client: TestClient, changes: dict, message: str) -> None:
    response = client.post("/api/v1/auth/signup", json={**ROSA, **changes})
    assert response.status_code == 422
    assert response.json()["detail"] == message


def test_sign_up_refuses_a_taken_username(client: TestClient) -> None:
    sign_up(client, client="ios")
    response = client.post("/api/v1/auth/signup", json={**ROSA, "email": "other@example.com"})
    assert response.status_code == 409
    assert response.json()["detail"] == "@rosa.parks is taken."


def test_sign_up_refuses_a_taken_email_whatever_its_capitals(client: TestClient) -> None:
    sign_up(client, client="ios")
    response = client.post(
        "/api/v1/auth/signup", json={**ROSA, "username": "rosa2", "email": "ROSA@example.COM"}
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "There’s already an account with that email."


# ─── Sign in ────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "login", ["rosa.parks", "@Rosa.Parks", "rosa@example.com", " ROSA@EXAMPLE.COM "]
)
def test_sign_in_with_username_or_email(client: TestClient, login: str) -> None:
    sign_up(client, client="ios")
    response = sign_in(client, login=login, client="ios")
    assert response.status_code == 200
    assert response.json()["account"]["username"] == "rosa.parks"


def test_wrong_password_and_unknown_account_get_the_same_answer(client: TestClient) -> None:
    sign_up(client, client="ios")
    wrong_password = sign_in(client, password="not the password", client="ios")
    no_account = sign_in(client, login="nobody", client="ios")
    assert wrong_password.status_code == no_account.status_code == 401
    assert wrong_password.json() == no_account.json()
    assert wrong_password.json()["detail"] == "That username or email and password don’t match."


def test_token_is_stored_only_as_a_hash(client: TestClient, db: Session) -> None:
    token = sign_up(client, client="ios")["token"]
    stored = db.scalar(select(AuthSession))
    assert stored is not None
    assert stored.token_hash == hashlib.sha256(token.encode()).hexdigest()
    assert token not in stored.token_hash


# ─── Who's asking ───────────────────────────────────────────────────────────


def test_me_needs_a_session(client: TestClient) -> None:
    response = client.get("/api/v1/me")
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert client.get("/api/v1/me", headers=bearer("made-up")).status_code == 401


def test_expired_session_is_refused(client: TestClient, db: Session) -> None:
    token = sign_up(client, client="ios")["token"]
    session = db.scalar(select(AuthSession))
    assert session is not None
    session.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    db.commit()
    assert client.get("/api/v1/me", headers=bearer(token)).status_code == 401


# ─── Sign out, and your devices ─────────────────────────────────────────────


def test_signing_out_on_one_device_leaves_the_others(
    browser: TestClient, client: TestClient
) -> None:
    sign_up(browser)
    phone_token = sign_in(client, client="ios", device_name="Rosa’s iPhone").json()["token"]

    response = browser.post("/api/v1/auth/signout")
    assert response.status_code == 204
    assert f'{COOKIE}=""' in response.headers["set-cookie"]  # cookie cleared

    assert browser.get("/api/v1/me").status_code == 401
    assert client.get("/api/v1/me", headers=bearer(phone_token)).status_code == 200


def test_revoked_token_is_refused_even_if_sent_again(client: TestClient) -> None:
    token = sign_up(client, client="ios")["token"]
    assert client.post("/api/v1/auth/signout", headers=bearer(token)).status_code == 204
    assert client.get("/api/v1/me", headers=bearer(token)).status_code == 401
    # Signing out again is fine.
    assert client.post("/api/v1/auth/signout", headers=bearer(token)).status_code == 204


def test_devices_list_and_signing_one_out(browser: TestClient, client: TestClient) -> None:
    sign_up(browser)
    phone_token = sign_in(client, client="ios", device_name="Rosa’s iPhone").json()["token"]

    devices = browser.get("/api/v1/me/sessions").json()
    assert sorted((d["client"], d["device_name"], d["current"]) for d in devices) == [
        ("ios", "Rosa’s iPhone", False),
        ("web", "Safari on Mac", True),
    ]

    phone = next(d for d in devices if d["client"] == "ios")
    assert browser.delete(f"/api/v1/me/sessions/{phone['id']}").status_code == 204
    assert client.get("/api/v1/me", headers=bearer(phone_token)).status_code == 401
    assert browser.get("/api/v1/me").status_code == 200
    assert len(browser.get("/api/v1/me/sessions").json()) == 1


def test_cannot_sign_out_someone_elses_device(browser: TestClient, client: TestClient) -> None:
    sign_up(browser)
    other = sign_up(client, client="ios", username="leo", email="leo@example.com")
    leo_session = client.get("/api/v1/me/sessions", headers=bearer(other["token"])).json()[0]

    response = browser.delete(f"/api/v1/me/sessions/{leo_session['id']}")
    assert response.status_code == 404
    assert client.get("/api/v1/me", headers=bearer(other["token"])).status_code == 200
    assert browser.delete(f"/api/v1/me/sessions/{uuid7()}").status_code == 404


# ─── Origin check ───────────────────────────────────────────────────────────


def test_cookie_request_without_origin_is_refused(browser: TestClient, db: Session) -> None:
    sign_up(browser)
    # Same cookies, no Origin header: what a forged form post from an old browser looks like.
    no_origin = TestClient(browser.app, cookies=browser.cookies)
    response = no_origin.post("/api/v1/auth/signout")
    assert response.status_code == 403
    assert response.json()["detail"] == "Missing Origin header."
    assert browser.get("/api/v1/me").status_code == 200  # still signed in


def test_request_from_another_site_is_refused(browser: TestClient) -> None:
    sign_up(browser)
    response = browser.post("/api/v1/auth/signout", headers={"Origin": "https://evil.example"})
    assert response.status_code == 403
    assert browser.get("/api/v1/me").status_code == 200

    sign_in_elsewhere = browser.post(
        "/api/v1/auth/signin",
        json={"login": "rosa.parks", "password": ROSA["password"]},
        headers={"Origin": "https://evil.example"},
    )
    assert sign_in_elsewhere.status_code == 403


def test_app_requests_need_no_origin(client: TestClient) -> None:
    token = sign_up(client, client="ios")["token"]
    assert client.post("/api/v1/auth/signout", headers=bearer(token)).status_code == 204


def test_reading_needs_no_origin(browser: TestClient) -> None:
    sign_up(browser)
    plain = TestClient(browser.app, cookies=browser.cookies)
    assert plain.get("/api/v1/me").status_code == 200


# ─── Rate limits ────────────────────────────────────────────────────────────


def test_too_many_sign_in_tries(client: TestClient) -> None:
    sign_up(client, client="ios")
    for _ in range(10):
        assert sign_in(client, password="guess guess", client="ios").status_code == 401
    response = sign_in(client, client="ios")  # even the right password, for now
    assert response.status_code == 429
    assert int(response.headers["retry-after"]) > 0
    assert response.json()["detail"].startswith("Too many tries.")
    # Another account isn't affected.
    assert sign_in(client, login="someone.else", client="ios").status_code == 401


def test_too_many_sign_ups(client: TestClient) -> None:
    for i in range(10):
        sign_up(client, client="ios", username=f"user{i}", email=f"user{i}@example.com")
    response = client.post(
        "/api/v1/auth/signup", json={**ROSA, "username": "user10", "email": "u10@example.com"}
    )
    assert response.status_code == 429


# ─── Device names ───────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("user_agent", "name"),
    [
        (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/26.0 "
            "Safari/605.1.15",
            "Safari on Mac",
        ),
        (
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 "
            "Version/18.5 Mobile/15E148 Safari/604.1",
            "Safari on iPhone",
        ),
        (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 "
            "Safari/537.36",
            "Chrome on Windows",
        ),
        (
            "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/140.0 Safari/537.36 Edg/140.0",
            "Edge on Windows",
        ),
        ("curl/8.7.1", "A web browser"),
    ],
)
def test_device_names(user_agent: str, name: str) -> None:
    assert device_name_from_user_agent(user_agent) == name
