"""Dashboard and analytics contracts."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.schemas.user import UserBrief


class DashboardSummary(BaseModel):
    week_start: date
    week_end: date

    #: Denominator for compliance — active users with the MEMBER role.
    total_members: int
    #: Submitted at least once (SUBMITTED + NEEDS_CORRECTION + APPROVED).
    submitted: int
    approved: int
    needs_correction: int
    #: Started but never submitted.
    pending: int
    #: No report row at all. Requires the roster, not the reports table.
    not_started: int
    #: First submission after the deadline.
    late: int
    compliance_rate: float

    open_blockers: int
    key_blockers: int
    total_tasks: int
    completed_tasks: int
    total_hours: Decimal

    #: Change vs the previous week, for the metric tiles' delta line.
    deltas: dict[str, float] = Field(default_factory=dict)


class TeamStatusRow(BaseModel):
    user: UserBrief
    job_title: str | None = None
    report_id: int | None = None
    status: str
    project_id: int | None = None
    project_name: str | None = None
    project_color: str | None = None
    current_version_no: int = 0
    submission_count: int = 0
    first_submitted_at: datetime | None = None
    is_late: bool = False


class StatusByMemberRow(BaseModel):
    user_id: int
    full_name: str
    draft: int
    submitted: int
    needs_correction: int
    approved: int
    not_started: int


class TaskTrendPoint(BaseModel):
    week_start: date
    label: str
    total_tasks: int
    completed_tasks: int
    hours_spent: Decimal


class ProjectWorkloadRow(BaseModel):
    project_id: int
    name: str
    color: str
    task_count: int
    hours_spent: Decimal


class TimeByTypeRow(BaseModel):
    task_type: str
    hours: Decimal


class ActivityItem(BaseModel):
    id: int
    action: str
    entity_type: str
    entity_id: int
    actor: UserBrief | None = None
    summary: str
    created_at: datetime


class WorkloadBalanceRow(BaseModel):
    user_id: int
    full_name: str
    task_count: int
    hours_spent: Decimal
    #: Distance from the team mean, in standard deviations.
    deviation: float = 0.0
    flag: str | None = None  # "overloaded" | "underloaded" | None


class WorkloadBalance(BaseModel):
    week_start: date
    mean_hours: float
    std_dev: float
    members: list[WorkloadBalanceRow]


class RecurringBlocker(BaseModel):
    description: str
    occurrences: int
    affected_members: int
    times_key: int


class MemberProfile(BaseModel):
    user: UserBrief
    email: str
    job_title: str | None = None
    role: str
    manager: UserBrief | None = None
    stats: dict
    weekly_status: list[dict]
