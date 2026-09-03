"""Project contracts."""
from __future__ import annotations

import re

from pydantic import BaseModel, ConfigDict, Field, field_validator

_HEX_COLOR = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


class ProjectBrief(BaseModel):
    """Embedded in report responses."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    code: str
    color: str


class ProjectOut(ProjectBrief):
    description: str | None = None
    is_archived: bool
    report_count: int = 0
    member_count: int = 0


class ProjectCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=2, max_length=120)
    code: str = Field(..., min_length=2, max_length=20)
    description: str | None = Field(None, max_length=2000)
    color: str = Field("#2a78d6", max_length=7)

    @field_validator("name", "description")
    @classmethod
    def collapse_whitespace(cls, v: str | None) -> str | None:
        return " ".join(v.split()) if v else v

    @field_validator("code")
    @classmethod
    def normalise_code(cls, v: str) -> str:
        code = v.strip().upper()
        if not code.isalnum():
            raise ValueError("Project code must contain only letters and numbers")
        return code

    @field_validator("color")
    @classmethod
    def validate_color(cls, v: str) -> str:
        if not _HEX_COLOR.match(v):
            raise ValueError("Color must be a hex value such as #2a78d6")
        return v.lower()


class ProjectUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(None, min_length=2, max_length=120)
    description: str | None = Field(None, max_length=2000)
    color: str | None = Field(None, max_length=7)
    is_archived: bool | None = None

    _validate_color = field_validator("color")(ProjectCreate.validate_color.__func__)
