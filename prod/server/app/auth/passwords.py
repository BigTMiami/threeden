"""Argon2id password hashing (argon2-cffi's defaults, which follow RFC 9106)."""

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

_hasher = PasswordHasher()

# Checked against when there's no such account, so a wrong username takes as
# long as a wrong password and doesn't reveal which accounts exist.
_DUMMY_HASH = _hasher.hash("not a real password")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def check_password(password: str, password_hash: str | None) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)
