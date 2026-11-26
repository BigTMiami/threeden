"""What makes a username, email, name, or password acceptable.

The same rules (and messages) as the prototype's js/state/accounts.js and
js/account/password.js, so people see the same answers in every client.
"""

import re

USERNAME_PATTERN = re.compile(r"^[a-z0-9_.]{3,20}$")
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 200
MAX_NAME_LENGTH = 100
MAX_EMAIL_LENGTH = 254


def normalize_username(username: str) -> str:
    return username.strip().lower().removeprefix("@")


def name_problem(name: str) -> str | None:
    if not name.strip():
        return "Add your name."
    if len(name.strip()) > MAX_NAME_LENGTH:
        return f"Use at most {MAX_NAME_LENGTH} characters for your name."
    return None


def username_problem(username: str) -> str | None:
    if not USERNAME_PATTERN.match(username):
        return "Use 3–20 lowercase letters, numbers, dots, or underscores."
    return None


def email_problem(email: str) -> str | None:
    if len(email) > MAX_EMAIL_LENGTH or not EMAIL_PATTERN.match(email):
        return "That doesn’t look like an email address."
    return None


def password_problem(password: str) -> str | None:
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"Use at least {MIN_PASSWORD_LENGTH} characters."
    if len(password) > MAX_PASSWORD_LENGTH:
        return f"Use at most {MAX_PASSWORD_LENGTH} characters."
    return None
