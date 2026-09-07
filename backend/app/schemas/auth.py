"""Authentication request/response contracts."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

# The password rule is shared with admin-created accounts, so it is defined
# once in `schemas/user.py` rather than duplicated here.
from app.schemas.user import CurrentUser, validate_password as _validate_password


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
