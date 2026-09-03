"""Report routes.

Thin: parse, authorize via dependencies, delegate to the service, serialise.
"""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.dependencies.auth import get_current_user
from app.dependencies.pagination import Pagination, pagination
from app.dependencies.reports import get_report_for_read, get_report_for_write
from app.models import Report, ReportStatus, User
from app.repositories.report_repository import ReportFilters
from app.schemas.common import Page
from app.schemas.report import (
    ReportContentUpdate,
    ReportCreate,
    ReportDetail,
    ReportListItem,
    ReviewBrief,
)
from app.services.report_service import ReportService

router = APIRouter(prefix="/reports", tags=["reports"])


def _latest_review(report: Report) -> ReviewBrief | None:
    if not report.reviews:
        return None
    latest = report.reviews[0]  # ordered created_at desc on the relationship
    return ReviewBrief(
        id=latest.id,
        action=latest.action.value,
        comment=latest.comment,
        against_version=latest.version.version_no,
        reviewer=latest.reviewer,
        created_at=latest.created_at,
    )


def _to_list_item(report: Report) -> ReportListItem:
    return ReportListItem(
        id=report.id,
        week_start=report.week_start,
        week_end=report.week_end,
        status=report.status,
        current_version_no=report.current_version_no,
        submission_count=report.submission_count,
        user=report.user,
        project=report.project,
        first_submitted_at=report.first_submitted_at,
        last_submitted_at=report.last_submitted_at,
        updated_at=report.updated_at,
        **ReportService.summarise(report),
    )


def _to_detail(report: Report) -> ReportDetail:
    return ReportDetail(
        id=report.id,
        week_start=report.week_start,
        week_end=report.week_end,
        status=report.status,
        current_version_no=report.current_version_no,
        submission_count=report.submission_count,
        is_editable=report.is_editable,
        user=report.user,
        project=report.project,
        notes=report.notes,
        links=report.links or [],
        tasks=report.tasks,
        next_week_tasks=report.next_week_tasks,
        blockers=report.blockers,
        achievements=report.achievements,
        hours_by_type={h.task_type.value: h.hours for h in report.hours},
        first_submitted_at=report.first_submitted_at,
        last_submitted_at=report.last_submitted_at,
        reviewed_at=report.reviewed_at,
        created_at=report.created_at,
        updated_at=report.updated_at,
        latest_review=_latest_review(report),
    )


@router.get("", response_model=Page[ReportListItem], summary="List reports")
def list_reports(
    week_start: date | None = Query(None, description="Exact week (any day is normalised)"),
    date_from: date | None = Query(None, alias="from"),
    date_to: date | None = Query(None, alias="to"),
    user_id: int | None = Query(None, ge=1),
    project_id: int | None = Query(None, ge=1),
    status_filter: str | None = Query(None, alias="status", description="Comma-separated"),
    search: str | None = Query(None, alias="q", max_length=200),
    sort: str = Query("-week_start"),
    page: Pagination = Depends(pagination),
    viewer: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Page[ReportListItem]:
    """Automatically scoped: a MEMBER sees only their own reports, and passing
    another member's `user_id` yields an empty list rather than their data."""
    statuses: list[ReportStatus] = []
    if status_filter:
        for raw in status_filter.split(","):
            token = raw.strip().upper()
            if token in ReportStatus.__members__:
                statuses.append(ReportStatus[token])

    filters = ReportFilters(
        week_start=week_start,
        date_from=date_from,
        date_to=date_to,
        user_id=user_id,
        project_id=project_id,
        statuses=statuses,
        search=search,
        sort=sort,
        limit=page.limit,
        offset=page.offset,
    )
    rows, total = ReportService(db).list_reports(viewer=viewer, filters=filters)
    return Page[ReportListItem](
        items=[_to_list_item(r) for r in rows],
        total=total,
        limit=page.limit,
        offset=page.offset,
    )


@router.post(
    "",
    response_model=ReportDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Open a draft for a week",
)
def create_report(
    payload: ReportCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ReportDetail:
    report = ReportService(db).create_draft(
        user=user, week_start=payload.week_start, project_id=payload.project_id
    )
    return _to_detail(report)


@router.get("/{report_id}", response_model=ReportDetail, summary="Read one report")
def get_report(report: Report = Depends(get_report_for_read)) -> ReportDetail:
    return _to_detail(report)


@router.put(
    "/{report_id}",
    response_model=ReportDetail,
    summary="Replace report content (author only, editable states only)",
)
def update_report(
    payload: ReportContentUpdate,
    report: Report = Depends(get_report_for_write),
    db: Session = Depends(get_db),
) -> ReportDetail:
    return _to_detail(ReportService(db).update_content(report, payload))


@router.delete(
    "/{report_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    response_class=Response,
    summary="Delete an unsubmitted draft",
)
def delete_report(
    report: Report = Depends(get_report_for_write), db: Session = Depends(get_db)
) -> None:
    ReportService(db).delete_draft(report)
