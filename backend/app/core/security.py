"""Password hashing and JWT primitives.

Pure functions with no database access, so they are trivially testable.
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

# bcrypt with cost 12. Deliberately slow and salted automatically — the opposite
# of what you want from a general-purpose hash, which is exactly the point.
# Never MD5/SHA for passwords: they are fast, and fast means cheap to brute force.
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)

TokenType = Literal["access", "refresh"]


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(plain, hashed)
    except ValueError:
        # A malformed stored hash must read as "wrong password", never a 500.
        return False


def create_access_token(
    subject: int | str, *, expires_delta: timedelta | None = None, **claims: Any
) -> str:
    return _encode(subject, "access", expires_delta or timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES), **claims)


def create_refresh_token(subject: int | str, *, expires_delta: timedelta | None = None) -> str:
    return _encode(subject, "refresh", expires_delta or timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS))


def _encode(subject: int | str, token_type: TokenType, delta: timedelta, **claims: Any) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": str(subject),
        # The type claim is what stops a refresh token being used as an access
        # token. Without it, the long-lived credential authenticates every
        # request and the short access-token TTL becomes meaningless.
        "type": token_type,
        "iat": now,
        "exp": now + delta,
        "jti": secrets.token_hex(8),
        **claims,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str, *, expected_type: TokenType | None = None) -> dict[str, Any] | None:
    """Return the payload, or None if the token is invalid, expired or the
    wrong type. Never raises — callers decide the HTTP consequence."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return None
    if expected_type is not None and payload.get("type") != expected_type:
        return None
    return payload


def generate_refresh_token_value() -> str:
    """The opaque value handed to the client in the HttpOnly cookie."""
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    """Refresh tokens are stored as SHA-256 hashes, so a database dump yields no
    usable sessions. SHA-256 rather than bcrypt is correct here: the input is
    48 bytes of cryptographic randomness, not a guessable human password, so
    there is nothing to slow an attacker down against."""
    return hashlib.sha256(token.encode()).hexdigest()
