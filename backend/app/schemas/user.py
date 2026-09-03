"""User response contracts.

Deliberately separate from the ORM model: `User` has `password_hash`, and these
must never have it. Collapsing the two is how hashes end up in API responses.
"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


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
