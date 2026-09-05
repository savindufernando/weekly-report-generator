"""Report business rules.

No `fastapi` import anywhere in this module — it raises domain exceptions, so
every rule here is unit-testable without an HTTP client.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.models import (
    Achievement,
    Blocker,
    NextWeekTask,
    Project,
    Report,
    ReportHours,
    ReportStatus,
    ReportTask,
    User,
)
from app.repositories.report_repository import ReportFilters, ReportRepository
from app.schemas.report import ReportContentUpdate
from app.services.activity_service import ActivityService
from app.services.report_workflow import ReportWorkflow, WorkflowEvent
from app.services.versioning import VersionService


class ReportService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.reports = ReportRepository(db)
        self.versions = VersionService(db)
        self.activity = ActivityService(db)

    # ------------------------------------------------------------------ create

    def create_draft(self, *, user: User, week_start: date, project_id: int) -> Report:
        project = self.db.get(Project, project_id)
        if project is None:
            raise NotFoundError("Project not found", field="project_id")
        if project.is_archived:
            raise ValidationError(
                "That project is archived and cannot be used for a new report",
                field="project_id",
            )

        if self.reports.get_for_week(user.id, week_start) is not None:
            raise ConflictError(
                f"You already have a report for the week of {week_start.isoformat()}",
                field="week_start",
            )

        report = Report(
            user_id=user.id,
            project_id=project_id,
            week_start=week_start,
            status=ReportStatus.DRAFT,
            current_version_no=0,
            submission_count=0,
        )
        try:
            self.reports.add(report)
            self.db.commit()
        except IntegrityError:
            # Lost the race against a concurrent create. The unique constraint
            # is what actually guarantees one report per week; the check above
            # only produces a nicer message in the common case.
            self.db.rollback()
            raise ConflictError(
                f"You already have a report for the week of {week_start.isoformat()}",
                field="week_start",
            ) from None

        self.db.refresh(report)
        return report

    # ------------------------------------------------------------------ update

    def update_content(self, report: Report, payload: ReportContentUpdate) -> Report:
        """Replace the report's content wholesale.

        Child collections are replaced rather than diffed: the editor always
        submits complete form state, so a full replacement is both simpler and
        free of partial-update bugs.
        """
        project = self.db.get(Project, payload.project_id)
        if project is None:
            raise NotFoundError("Project not found", field="project_id")

        report.project_id = payload.project_id
        report.notes = payload.notes
        report.links = [link.model_dump() for link in payload.links]

        self._replace_children(report, payload)

        try:
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            # The generated-column unique index is the real guarantee for the
            # one-key rule; the schema validator just gets there first usually.
            if "one_key" in str(exc.orig):
                raise ValidationError(
                    "Only one blocker and one achievement can be flagged as key"
                ) from None
            raise

        self.db.refresh(report)
        return report

    def _replace_children(self, report: Report, payload: ReportContentUpdate) -> None:
        # Delete the old rows and FLUSH before inserting the new ones.
        #
        # Without this flush, SQLAlchemy's unit of work emits the INSERTs for the
        # replacement rows before the DELETEs for the ones they replace. For
        # blockers and achievements that means two rows momentarily share
        # key_guard = report_id, which trips the unique index enforcing "one key
        # item per report" — an update that is perfectly valid gets rejected.
        report.tasks.clear()
        report.next_week_tasks.clear()
        report.blockers.clear()
        report.achievements.clear()
        report.hours.clear()
        self.db.flush()

        report.tasks = [
            ReportTask(
                name=t.name,
                priority=t.priority,
                status=t.status,
                project_id=t.project_id,
                planned_pct=t.planned_pct,
                actual_pct=t.actual_pct,
                hours_planned=t.hours_planned,
                hours_spent=t.hours_spent,
                deliverable=t.deliverable,
                order_index=index,
            )
            for index, t in enumerate(payload.tasks)
        ]
        report.next_week_tasks = [
            NextWeekTask(description=n.description, priority=n.priority, order_index=index)
            for index, n in enumerate(payload.next_week_tasks)
        ]
        report.blockers = [
            Blocker(
                description=b.description,
                severity=b.severity,
                is_key=b.is_key,
                is_resolved=b.is_resolved,
                order_index=index,
            )
            for index, b in enumerate(payload.blockers)
        ]
        report.achievements = [
            Achievement(description=a.description, is_key=a.is_key, order_index=index)
            for index, a in enumerate(payload.achievements)
        ]
        report.hours = [
            ReportHours(task_type=task_type, hours=hours)
            for task_type, hours in payload.hours_by_type.items()
            if hours > 0
        ]

    # ------------------------------------------------------------------ submit

    def submit(
        self, report: Report, actor: User, *, at: datetime | None = None
    ) -> tuple[Report, list[str]]:
        """Submit or resubmit a report for review.

        `at` overrides the timestamp. Only the seed script passes it, so that
        demo history lands in the past — the API never supplies it, and a client
        therefore cannot backdate a submission to dodge the lateness rule.

        Ordering inside the transaction is deliberate: validate the transition,
        write the snapshot, *then* advance the status. If anything fails the
        whole thing rolls back, so there can never be an orphan version or a
        status change with no version behind it.

        Returns the report and any non-fatal warnings for the client.
        """
        # 1. Is this legal at all? The state machine is the single authority.
        ReportWorkflow.assert_can(report.status, WorkflowEvent.SUBMIT)

        # 2. Business rules that go beyond the schema's shape checks.
        if not report.tasks:
            raise ValidationError(
                "Add at least one completed task before submitting", field="tasks"
            )
        if sum(1 for b in report.blockers if b.is_key) > 1:
            raise ValidationError("Only one blocker can be flagged as the key issue")
        if sum(1 for a in report.achievements if a.is_key) > 1:
            raise ValidationError("Only one achievement can be flagged as the key achievement")

        warnings: list[str] = []
        if self.versions.is_unchanged_since_last(report):
            # Not an error — the member may genuinely mean it — but worth saying
            # rather than silently storing an identical version.
            warnings.append("no_changes_detected")

        now = at or datetime.utcnow()

        # 3. Snapshot BEFORE the status moves, in this same transaction.
        version = self.versions.create_snapshot(report, actor, submitted_at=now)

        # 4. Advance the report.
        report.status = ReportWorkflow.next_status(report.status, WorkflowEvent.SUBMIT)
        report.current_version_no = version.version_no
        report.submission_count += 1
        report.last_submitted_at = now
        if report.first_submitted_at is None:
            # Set once and never again: lateness is judged on the FIRST
            # submission, so correcting a report cannot make it retroactively late.
            report.first_submitted_at = now

        self.activity.log(
            actor,
            "report",
            report.id,
            "SUBMITTED",
            {"version": version.version_no, "week_start": report.week_start.isoformat()},
        )

        self.db.commit()
        self.db.refresh(report)
        return report, warnings

    # ------------------------------------------------------------------ delete

    def delete_draft(self, report: Report) -> None:
        # Once submitted, a report is part of the record and the review history
        # references it. Only an unsubmitted draft can be removed.
        if report.status is not ReportStatus.DRAFT or report.submission_count > 0:
            raise ConflictError("Only an unsubmitted draft can be deleted")
        self.reports.delete(report)
        self.db.commit()

    # ------------------------------------------------------------------- reads

    def list_reports(self, *, viewer: User, filters: ReportFilters):
        return self.reports.list(viewer=viewer, filters=filters)

    # -------------------------------------------------------------- aggregates

    @staticmethod
    def summarise(report: Report) -> dict:
        """Row-level aggregates for list responses, computed from already-loaded
        collections so listing does not trigger extra queries."""
        from app.models.enums import TaskStatus

        key_blocker = next((b for b in report.blockers if b.is_key), None)
        return {
            "task_count": len(report.tasks),
            "completed_task_count": sum(
                1 for t in report.tasks if t.status is TaskStatus.COMPLETED
            ),
            "total_hours_spent": sum(
                (t.hours_spent for t in report.tasks), Decimal("0")
            ),
            "key_blocker": key_blocker.description if key_blocker else None,
        }
