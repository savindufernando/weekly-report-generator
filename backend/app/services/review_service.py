"""Manager review actions.

This is the only place in the system where a manager writes to a report, and it
writes exactly two things: the status, and a comment row. Report content is
unreachable from here — see `schemas/review.py`, which has no content fields.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import PermissionDenied, ValidationError
from app.models import Report, ReportStatus, ReviewAction, ReviewHistory, User
from app.services.activity_service import ActivityService
from app.services.report_workflow import ReportWorkflow, WorkflowEvent

_EVENT_FOR_ACTION = {
    ReviewAction.APPROVE: WorkflowEvent.APPROVE,
    ReviewAction.REQUEST_CHANGES: WorkflowEvent.REQUEST_CHANGES,
}


class ReviewService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.activity = ActivityService(db)

    def review(
        self,
        report: Report,
        reviewer: User,
        *,
        action: ReviewAction,
        comment: str | None = None,
        at: datetime | None = None,
    ) -> ReviewHistory:
        # Segregation of duties. A deliberate product decision, not an
        # oversight: approving your own work defeats the point of review.
        if report.user_id == reviewer.id:
            raise PermissionDenied("You cannot review your own report")

        # The state machine rejects reviewing anything not currently submitted,
        # which is also what makes two managers racing safe: the second gets 409.
        event = _EVENT_FOR_ACTION[action]
        new_status = ReportWorkflow.next_status(report.status, event)

        if action is ReviewAction.REQUEST_CHANGES and not (comment or "").strip():
            raise ValidationError(
                "Explain what needs correcting so the author knows what to change",
                field="comment",
            )

        version = report.versions[0] if report.versions else None
        if version is None:
            # Unreachable in practice — a SUBMITTED report always has a version
            # — but a guard here beats a null foreign key if that ever changes.
            raise ValidationError("This report has no submitted version to review")

        now = at or datetime.utcnow()
        previous_status = report.status

        entry = ReviewHistory(
            report_id=report.id,
            # THE critical line: the comment points at the exact version it was
            # written against, not merely at the report. Without this there is
            # no way to answer "which version was this comment about?".
            report_version_id=version.id,
            reviewer_id=reviewer.id,
            action=action,
            comment=(comment or "").strip() or None,
            previous_status=previous_status,
            new_status=new_status,
            created_at=now,
        )
        self.db.add(entry)

        report.status = new_status
        report.reviewed_at = now
        report.reviewed_by = reviewer.id

        self.activity.log(
            reviewer,
            "report",
            report.id,
            action.value,
            {
                "version": version.version_no,
                "author": report.user.full_name,
                "week_start": report.week_start.isoformat(),
            },
        )

        self.db.commit()
        self.db.refresh(entry)
        return entry

    # ------------------------------------------------------------------ queue

    def review_queue(
        self,
        *,
        statuses: list[ReportStatus] | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[Report], int]:
        """Reports awaiting a manager, oldest submission first."""
        wanted = statuses or [ReportStatus.SUBMITTED]
        stmt = select(Report).where(Report.status.in_(wanted))
        total = self.db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        rows = self.db.scalars(
            stmt.order_by(Report.last_submitted_at.asc(), Report.id.asc())
            .limit(limit)
            .offset(offset)
        ).unique().all()
        return list(rows), total
