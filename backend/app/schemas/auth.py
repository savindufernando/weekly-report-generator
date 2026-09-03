"""Authentication request/response contracts."""
from __future__ import annotations

import re

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.schemas.user import CurrentUser

# At least one letter and one digit. Deliberately modest: length matters far
# more than symbol classes, and heavy composition rules push people toward
# predictable substitutions.
_HAS_LETTER = re.compile(r"[A-Za-z]")
_HAS_DIGIT = re.compile(r"\d")


def _validate_password(v: str) -> str:
    if not _HAS_LETTER.search(v) or not _HAS_DIGIT.search(v):
        raise ValueError("Password must contain at least one letter and one number")
    return v


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str = Field(..., min_length=2, max_length=150)

    # NOTE: there is deliberately no `role` field. Accepting a role from the
    # registration body would be privilege escalation — new accounts are always
    # MEMBER, and only an admin can elevate.

    _check_password = field_validator("password")(_validate_password)

    @field_validator("full_name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        cleaned = " ".join(v.split())
        if len(cleaned) < 2:
            raise ValueError("Please enter your full name")
        return cleaned


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)


class ChangePasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)

    _check_password = field_validator("new_password")(_validate_password)


class TokenResponse(BaseModel):
    """The refresh token is NOT here — it goes out as an HttpOnly cookie so
    JavaScript cannot read it."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: CurrentUser


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
