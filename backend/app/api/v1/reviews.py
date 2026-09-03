"""Submission, version history and review routes."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.database.session import get_db
from app.dependencies.auth import get_current_user, require_permission
from app.dependencies.pagination import Pagination, pagination
from app.dependencies.reports import get_report_for_read, get_report_for_write
from app.models import Report, ReportStatus, ReportVersion, ReviewHistory, User
from app.schemas.common import Page
from app.schemas.review import (
    ReviewOut,
    ReviewRequest,
    ReviewResponse,
    SubmitResponse,
    VersionDetail,
    VersionSummary,
)
from app.services.report_service import ReportService
from app.services.review_service import ReviewService

router = APIRouter(tags=["reports"])


def _review_out(entry: ReviewHistory) -> ReviewOut:
    return ReviewOut(
        id=entry.id,
        action=entry.action,
        comment=entry.comment,
        against_version=entry.version.version_no,
        previous_status=entry.previous_status,
        new_status=entry.new_status,
        reviewer=entry.reviewer,
        created_at=entry.created_at,
    )


def _version_summary(
    version: ReportVersion, report: Report, reviews_by_version: dict[int, ReviewHistory]
) -> VersionSummary:
    entry = reviews_by_version.get(version.id)
    return VersionSummary(
        version_no=version.version_no,
        submitted_at=version.submitted_at,
        submitted_by=version.submitter,
        is_current=version.version_no == report.current_version_no,
        content_hash=version.content_hash,
        review=_review_out(entry) if entry else None,
    )


def _reviews_by_version(report: Report) -> dict[int, ReviewHistory]:
    """Latest review per version. `report.reviews` is ordered newest first, so
    the first entry seen for a version id is the one that stands."""
    mapping: dict[int, ReviewHistory] = {}
    for entry in report.reviews:
        mapping.setdefault(entry.report_version_id, entry)
    return mapping


# --------------------------------------------------------------------- submit


@router.post(
    "/reports/{report_id}/submit",
    response_model=SubmitResponse,
    summary="Submit or resubmit a report for review",
)
def submit_report(
    report: Report = Depends(get_report_for_write),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SubmitResponse:
    updated, warnings = ReportService(db).submit(report, user)
    return SubmitResponse(
        id=updated.id,
        status=updated.status,
        current_version_no=updated.current_version_no,
        submission_count=updated.submission_count,
        last_submitted_at=updated.last_submitted_at,
        warnings=warnings,
    )


# -------------------------------------------------------------------- history


@router.get(
    "/reports/{report_id}/versions",
    response_model=list[VersionSummary],
    summary="Every submitted version of this report, newest first",
)
def list_versions(report: Report = Depends(get_report_for_read)) -> list[VersionSummary]:
    mapping = _reviews_by_version(report)
    return [_version_summary(v, report, mapping) for v in report.versions]


@router.get(
    "/reports/{report_id}/versions/{version_no}",
    response_model=VersionDetail,
    summary="The frozen content of one past version",
)
def get_version(
    version_no: int, report: Report = Depends(get_report_for_read)
) -> VersionDetail:
    version = next((v for v in report.versions if v.version_no == version_no), None)
    if version is None:
        raise NotFoundError(f"Version {version_no} not found for this report")

    mapping = _reviews_by_version(report)
    summary = _version_summary(version, report, mapping)
    return VersionDetail(**summary.model_dump(), content=version.content)


@router.get(
    "/reports/{report_id}/comments",
    response_model=list[ReviewOut],
    summary="Full review history, oldest first",
)
def list_comments(report: Report = Depends(get_report_for_read)) -> list[ReviewOut]:
    # Oldest first so the page reads as a conversation.
    return [_review_out(entry) for entry in reversed(report.reviews)]


# --------------------------------------------------------------------- review


@router.post(
    "/reports/{report_id}/review",
    response_model=ReviewResponse,
    dependencies=[Depends(require_permission("report.review"))],
    summary="Approve, or request changes with a comment",
)
def review_report(
    payload: ReviewRequest,
    report: Report = Depends(get_report_for_read),
    reviewer: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ReviewResponse:
    """The only manager write path in the API.

    Note it depends on `get_report_for_read`, not `_for_write`: a manager may
    act on a report they do not own, but the payload schema means the only
    things they can change are the status and a comment.
    """
    entry = ReviewService(db).review(
        report, reviewer, action=payload.action, comment=payload.comment
    )
    return ReviewResponse(
        report_id=report.id, status=report.status, review=_review_out(entry)
    )


@router.get(
    "/review-queue",
    response_model=Page[dict],
    dependencies=[Depends(require_permission("report.review"))],
    summary="Reports awaiting review, oldest first",
)
def review_queue(
    status_filter: str = Query("SUBMITTED", alias="status"),
    page: Pagination = Depends(pagination),
    db: Session = Depends(get_db),
) -> Page[dict]:
    statuses = [
        ReportStatus[token.strip().upper()]
        for token in status_filter.split(",")
        if token.strip().upper() in ReportStatus.__members__
    ]
    rows, total = ReviewService(db).review_queue(
        statuses=statuses, limit=page.limit, offset=page.offset
    )

    from datetime import datetime

    now = datetime.utcnow()
    items = [
        {
            "id": r.id,
            "week_start": r.week_start.isoformat(),
            "status": r.status.value,
            "current_version_no": r.current_version_no,
            "submission_count": r.submission_count,
            "user": {"id": r.user.id, "full_name": r.user.full_name},
            "project": {"id": r.project.id, "name": r.project.name, "color": r.project.color},
            "last_submitted_at": (
                r.last_submitted_at.isoformat() if r.last_submitted_at else None
            ),
            # Drives the "waiting too long" flag in the queue UI.
            "waiting_hours": (
                round((now - r.last_submitted_at).total_seconds() / 3600, 1)
                if r.last_submitted_at
                else None
            ),
        }
        for r in rows
    ]
    return Page[dict](items=items, total=total, limit=page.limit, offset=page.offset)
