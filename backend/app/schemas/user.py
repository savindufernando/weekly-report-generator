"""User response contracts.

Deliberately separate from the ORM model: `User` has `password_hash`, and these
must never have it. Collapsing the two is how hashes end up in API responses.
"""
from __future__ import annotations

import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.enums import RoleCode

# At least one letter and one digit. Deliberately modest: length matters far
# more than symbol classes, and heavy composition rules push people toward
# predictable substitutions. Lives here rather than in `auth.py` because both
# self-registration and admin-created accounts must enforce the same rule, and
# `auth.py` already imports from this module.
_HAS_LETTER = re.compile(r"[A-Za-z]")
_HAS_DIGIT = re.compile(r"\d")


def validate_password(v: str) -> str:
    if not _HAS_LETTER.search(v) or not _HAS_DIGIT.search(v):
        raise ValueError("Password must contain at least one letter and one number")
    return v


class RoleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    name: str


class UserBrief(BaseModel):
    """Embedded in lists — the minimum needed to render a person."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    avatar_url: str | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    full_name: str
    job_title: str | None = None
    avatar_url: str | None = None
    is_active: bool
    role: RoleOut
    created_at: datetime


class CurrentUser(UserOut):
    """`/auth/me` and the login response.

    Carries resolved permission *codes* so the frontend never hardcodes role
    names — adding a role later changes no frontend code.
    """

    permissions: list[str] = Field(default_factory=list)


class UserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: str | None = Field(None, min_length=2, max_length=150)
    job_title: str | None = Field(None, max_length=100)
    avatar_url: str | None = Field(None, max_length=500)


class UserCreate(BaseModel):
    """Admin-created account.

    Unlike `RegisterRequest` this *does* carry a role: the caller has already
    passed the `user.manage_roles` gate, so assigning one here is the point
    rather than an escalation. Self-registration still cannot.
    """

    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=150)
    role_code: RoleCode = RoleCode.MEMBER
    job_title: str | None = Field(None, max_length=100)
    #: Omit to have one generated and returned once in the response.
    password: str | None = Field(None, min_length=8, max_length=128)
    #: Omit to report to the admin creating the account.
    manager_id: int | None = Field(None, ge=1)

    @field_validator("password")
    @classmethod
    def check_password(cls, v: str | None) -> str | None:
        return v if v is None else validate_password(v)

    @field_validator("full_name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        cleaned = " ".join(v.split())
        if len(cleaned) < 2:
            raise ValueError("Please enter a full name")
        return cleaned


class UserCreated(UserOut):
    """The create response.

    `temporary_password` is populated only when the server generated one, and
    only in this one response — it is never stored in plaintext and cannot be
    read back afterwards. If the admin loses it, the account needs a reset.
    """

    temporary_password: str | None = None
