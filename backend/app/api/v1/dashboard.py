"""Manager dashboard and analytics.

Every route here requires `dashboard.view`, which members do not have.
"""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.dependencies.auth import require_permission
from app.dependencies.pagination import Pagination, pagination
from app.schemas.common import Page
from app.schemas.dashboard import (
    ActivityItem,
    DashboardSummary,
    ProjectWorkloadRow,
    RecurringBlocker,
    StatusByMemberRow,
    TaskTrendPoint,
    TeamStatusRow,
    TimeByTypeRow,
    WorkloadBalance,
)
from app.services.dashboard_service import DashboardService
from app.utils.week import current_week_start, monday_of

router = APIRouter(
    prefix="/dashboard",
    tags=["dashboard"],
    dependencies=[Depends(require_permission("dashboard.view"))],
)


def _week(value: date | None) -> date:
    """Normalise any supplied day to its Monday; default to this week."""
    return monday_of(value) if value else current_week_start()


@router.get("/summary", response_model=DashboardSummary, summary="Headline metrics")
def summary(
    week_start: date | None = Query(None),
    project_id: int | None = Query(None, ge=1),
    db: Session = Depends(get_db),
) -> DashboardSummary:
    return DashboardService(db).summary(_week(week_start), project_id=project_id)


@router.get(
    "/team-status",
    response_model=list[TeamStatusRow],
    summary="Every active member for the week, including those who have not started",
)
def team_status(
    week_start: date | None = Query(None),
    project_id: int | None = Query(None, ge=1),
    db: Session = Depends(get_db),
) -> list[TeamStatusRow]:
    return DashboardService(db).team_status(_week(week_start), project_id=project_id)


@router.get(
    "/charts/status-by-member",
    response_model=list[StatusByMemberRow],
    summary="Stacked bar: report status counts per member",
)
def status_by_member(
    date_from: date | None = Query(None, alias="from"),
    date_to: date | None = Query(None, alias="to"),
    db: Session = Depends(get_db),
) -> list[StatusByMemberRow]:
    end = _week(date_to)
    start = monday_of(date_from) if date_from else end - timedelta(weeks=7)
    return DashboardService(db).status_by_member(start, end)


@router.get(
    "/charts/task-trend",
    response_model=list[TaskTrendPoint],
    summary="Line: tasks completed over time",
)
def task_trend(
    weeks: int = Query(8, ge=1, le=52),
    ending: date | None = Query(None),
    db: Session = Depends(get_db),
) -> list[TaskTrendPoint]:
    return DashboardService(db).task_trend(weeks=weeks, ending=ending)


@router.get(
    "/charts/workload-by-project",
    response_model=list[ProjectWorkloadRow],
    summary="Bar: task and hour distribution by project",
)
def workload_by_project(
    date_from: date | None = Query(None, alias="from"),
    date_to: date | None = Query(None, alias="to"),
    db: Session = Depends(get_db),
) -> list[ProjectWorkloadRow]:
    end = _week(date_to)
    start = monday_of(date_from) if date_from else end - timedelta(weeks=7)
    return DashboardService(db).workload_by_project(start, end)


@router.get(
    "/charts/time-by-type",
    response_model=list[TimeByTypeRow],
    summary="Bar: hours by task type, team-wide",
)
def time_by_type(
    date_from: date | None = Query(None, alias="from"),
    date_to: date | None = Query(None, alias="to"),
    db: Session = Depends(get_db),
) -> list[TimeByTypeRow]:
    end = _week(date_to)
    start = monday_of(date_from) if date_from else end - timedelta(weeks=7)
    return DashboardService(db).time_by_task_type(start, end)


@router.get(
    "/activity",
    response_model=Page[ActivityItem],
    summary="Recent submissions and review actions",
)
def activity(
    page: Pagination = Depends(pagination), db: Session = Depends(get_db)
) -> Page[ActivityItem]:
    items, total = DashboardService(db).activity_feed(limit=page.limit, offset=page.offset)
    return Page[ActivityItem](
        items=items, total=total, limit=page.limit, offset=page.offset
    )


# ------------------------------------------------------------------ analytics


@router.get(
    "/analytics/workload-balance",
    response_model=WorkloadBalance,
    summary="Hours per member with the team mean and outlier flags",
)
def workload_balance(
    week_start: date | None = Query(None), db: Session = Depends(get_db)
) -> WorkloadBalance:
    return DashboardService(db).workload_balance(_week(week_start))


@router.get(
    "/analytics/recurring-blockers",
    response_model=list[RecurringBlocker],
    summary="Blockers appearing more than once in the period",
)
def recurring_blockers(
    weeks: int = Query(8, ge=1, le=52), db: Session = Depends(get_db)
) -> list[RecurringBlocker]:
    end = current_week_start()
    return DashboardService(db).recurring_blockers(end - timedelta(weeks=weeks - 1), end)
