"""Weekly report contracts.

The report structure is fixed and identical for every user — these models *are*
the structure. There is deliberately no mechanism for a client to add, reorder
or name its own fields, which is what keeps reports comparable across the team.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.enums import (
    BlockerSeverity,
    ReportStatus,
    TaskPriority,
    TaskStatus,
    TaskType,
)
from app.schemas.project import ProjectBrief
from app.schemas.user import UserBrief
from app.utils.week import monday_of

MAX_HOURS_PER_WEEK = 168  # 24 x 7 — a hard physical ceiling, not a policy.


# --------------------------------------------------------------------- children

class TaskIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=255)
    priority: TaskPriority = TaskPriority.MEDIUM
    status: TaskStatus = TaskStatus.IN_PROGRESS
    project_id: int | None = Field(None, ge=1)
    planned_pct: int = Field(0, ge=0, le=100)
    actual_pct: int = Field(0, ge=0, le=100)
    hours_planned: Decimal = Field(Decimal("0"), ge=0, le=MAX_HOURS_PER_WEEK, decimal_places=2)
    hours_spent: Decimal = Field(Decimal("0"), ge=0, le=MAX_HOURS_PER_WEEK, decimal_places=2)
    deliverable: str | None = Field(None, max_length=500)

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: str) -> str:
        cleaned = " ".join(v.split())
        if not cleaned:
            raise ValueError("Task name is required")
        return cleaned


class TaskOut(TaskIn):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_index: int


class NextWeekTaskIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    description: str = Field(..., min_length=1, max_length=500)
    priority: TaskPriority = TaskPriority.MEDIUM


class NextWeekTaskOut(NextWeekTaskIn):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_index: int


class BlockerIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    description: str = Field(..., min_length=1, max_length=2000)
    severity: BlockerSeverity = BlockerSeverity.MEDIUM
    #: At most one blocker per report may set this — "the key issue for the week".
    is_key: bool = False
    is_resolved: bool = False


class BlockerOut(BlockerIn):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_index: int


class AchievementIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    description: str = Field(..., min_length=1, max_length=2000)
    #: At most one achievement per report may set this.
    is_key: bool = False


class AchievementOut(AchievementIn):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_index: int


class LinkIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str = Field(..., min_length=1, max_length=120)
    url: str = Field(..., min_length=1, max_length=500)


# ----------------------------------------------------------------------- report

class ReportCreate(BaseModel):
    """Opens a draft for a week. Content arrives later via PUT."""

    model_config = ConfigDict(extra="forbid")

    week_start: date
    project_id: int = Field(..., ge=1)

    @field_validator("week_start")
    @classmethod
    def normalise_and_bound(cls, v: date) -> date:
        # Any day in the week is accepted and coerced to that week's Monday:
        # rejecting a Wednesday would be needless friction, and coercing here
        # means week identity is computed once, server-side.
        week = monday_of(v)
        if week > monday_of(date.today()) + timedelta(weeks=1):
            raise ValueError("Cannot create a report more than one week ahead")
        return week


class ReportContentUpdate(BaseModel):
    """Full replacement of the report's content.

    The client always sends complete form state rather than a patch. That
    removes an entire class of partial-update bugs and matches how the editor
    actually works — the alternative is per-collection diffing on the server.
    """

    model_config = ConfigDict(extra="forbid")

    project_id: int = Field(..., ge=1)
    notes: str | None = Field(None, max_length=5000)
    links: list[LinkIn] = Field(default_factory=list, max_length=20)
    tasks: list[TaskIn] = Field(default_factory=list, max_length=50)
    next_week_tasks: list[NextWeekTaskIn] = Field(default_factory=list, max_length=50)
    blockers: list[BlockerIn] = Field(default_factory=list, max_length=30)
    achievements: list[AchievementIn] = Field(default_factory=list, max_length=30)
    hours_by_type: dict[TaskType, Decimal] = Field(default_factory=dict)

    @model_validator(mode="after")
    def at_most_one_key_item(self):
        # The brief says to flag *one* blocker and *one* achievement as the key
        # item. The database enforces this too, via a generated column and a
        # unique index; this check exists so the user gets a clear 422 instead
        # of a raw integrity error.
        if sum(1 for b in self.blockers if b.is_key) > 1:
            raise ValueError("Only one blocker can be flagged as the key issue")
        if sum(1 for a in self.achievements if a.is_key) > 1:
            raise ValueError("Only one achievement can be flagged as the key achievement")
        return self

    @field_validator("hours_by_type")
    @classmethod
    def bound_hours(cls, v: dict[TaskType, Decimal]) -> dict[TaskType, Decimal]:
        for task_type, hours in v.items():
            if hours < 0:
                raise ValueError(f"Hours for {task_type.value} cannot be negative")
        if sum(v.values()) > MAX_HOURS_PER_WEEK:
            raise ValueError("Total hours cannot exceed 168 in a week")
        return v


# ---------------------------------------------------------------------- outputs

class ReviewBrief(BaseModel):
    """The latest review action, and crucially which version it targeted."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    action: str
    comment: str | None
    against_version: int
    reviewer: UserBrief
    created_at: datetime


class ReportListItem(BaseModel):
    """Row shape for list views — aggregates precomputed, no child collections."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    week_start: date
    week_end: date | None
    status: ReportStatus
    current_version_no: int
    submission_count: int
    user: UserBrief
    project: ProjectBrief
    task_count: int = 0
    completed_task_count: int = 0
    total_hours_spent: Decimal = Decimal("0")
    key_blocker: str | None = None
    first_submitted_at: datetime | None = None
    last_submitted_at: datetime | None = None
    updated_at: datetime
    latest_review: ReviewBrief | None = None


class ReportDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    week_start: date
    week_end: date | None
    status: ReportStatus
    current_version_no: int
    submission_count: int
    is_editable: bool
    user: UserBrief
    project: ProjectBrief

    notes: str | None = None
    links: list[LinkIn] = Field(default_factory=list)
    tasks: list[TaskOut] = Field(default_factory=list)
    next_week_tasks: list[NextWeekTaskOut] = Field(default_factory=list)
    blockers: list[BlockerOut] = Field(default_factory=list)
    achievements: list[AchievementOut] = Field(default_factory=list)
    hours_by_type: dict[str, Decimal] = Field(default_factory=dict)

    first_submitted_at: datetime | None = None
    last_submitted_at: datetime | None = None
    reviewed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    latest_review: ReviewBrief | None = None
