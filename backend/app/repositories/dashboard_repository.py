"""Dashboard aggregates.

Everything here aggregates in SQL. Summing tasks per member in Python is the
classic N+1 in this shape of app: one query per member per week instead of one
query for the whole chart.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import String, Row, and_, case, func, literal, select, type_coerce
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import (
    Blocker,
    Project,
    Report,
    ReportHours,
    ReportStatus,
    ReportTask,
    Role,
    RoleCode,
    TaskStatus,
    User,
)

#: Statuses that mean "this person has submitted at least once this week".
SUBMITTED_STATES = (
    ReportStatus.SUBMITTED,
    ReportStatus.NEEDS_CORRECTION,
    ReportStatus.APPROVED,
)


class DashboardRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ------------------------------------------------------------------ roster

    def _member_role_id(self):
        return select(Role.id).where(Role.code == RoleCode.MEMBER.value).scalar_subquery()

    def active_member_count(self) -> int:
        """The compliance denominator: active users with the MEMBER role."""
        return self.db.scalar(
            select(func.count())
            .select_from(User)
            .where(User.is_active.is_(True), User.role_id == self._member_role_id())
        ) or 0

    def deadline_for(self, week_start: date) -> datetime:
        """When a first submission stops being on time.

        The brief asks for "late" but never defines a deadline, so this is our
        documented assumption: end of the week plus a configurable grace period.
        """
        return datetime.combine(week_start, datetime.min.time()) + timedelta(
            days=7, hours=settings.SUBMISSION_DEADLINE_GRACE_HOURS
        )

    # ------------------------------------------------------------- team status

    def team_status(self, week_start: date, *, project_id: int | None = None) -> list[Row]:
        """One row per active member for the week — including members who never
        filed.

        This is the query most implementations get wrong. A member with no
        report has NO ROW in `reports`, so anything that scans that table alone
        silently omits exactly the people a manager needs to see. The roster
        must drive the join.

        Note the week predicate sits in the ON clause, not the WHERE. Moved to
        WHERE it would filter out the NULL-report rows and quietly turn this
        LEFT JOIN back into an INNER JOIN.
        """
        join_condition = and_(
            Report.user_id == User.id,
            Report.week_start == week_start,
        )
        if project_id:
            join_condition = and_(join_condition, Report.project_id == project_id)

        deadline = self.deadline_for(week_start)

        stmt = (
            select(
                User.id.label("user_id"),
                User.full_name,
                User.avatar_url,
                User.job_title,
                Report.id.label("report_id"),
                # type_coerce, not a plain COALESCE: SQLAlchemy would otherwise
                # apply the ENUM result processor to this column and reject
                # "NOT_STARTED", which is deliberately not a stored status — it
                # is the synthetic value meaning "this member has no report".
                # type_coerce changes only how the result is read, not the SQL.
                type_coerce(
                    func.coalesce(Report.status, literal("NOT_STARTED")), String
                ).label("status"),
                Report.current_version_no,
                Report.submission_count,
                Report.first_submitted_at,
                Report.last_submitted_at,
                Project.id.label("project_id"),
                Project.name.label("project_name"),
                Project.color.label("project_color"),
                case(
                    (Report.first_submitted_at.is_(None), literal(0)),
                    (Report.first_submitted_at > deadline, literal(1)),
                    else_=literal(0),
                ).label("is_late"),
            )
            .select_from(User)
            .outerjoin(Report, join_condition)
            .outerjoin(Project, Project.id == Report.project_id)
            .where(User.is_active.is_(True), User.role_id == self._member_role_id())
            .order_by(User.full_name)
        )
        return list(self.db.execute(stmt).all())

    # ---------------------------------------------------------------- summary

    def week_counts(self, week_start: date, *, project_id: int | None = None) -> dict:
        """Status counts and lateness for one week, in a single query."""
        deadline = self.deadline_for(week_start)
        stmt = (
            select(
                func.count().label("total"),
                func.sum(case((Report.status == ReportStatus.DRAFT, 1), else_=0)).label("draft"),
                func.sum(case((Report.status == ReportStatus.SUBMITTED, 1), else_=0)).label(
                    "submitted_pending"
                ),
                func.sum(
                    case((Report.status == ReportStatus.NEEDS_CORRECTION, 1), else_=0)
                ).label("needs_correction"),
                func.sum(case((Report.status == ReportStatus.APPROVED, 1), else_=0)).label(
                    "approved"
                ),
                func.sum(
                    case((Report.status.in_(SUBMITTED_STATES), 1), else_=0)
                ).label("submitted_total"),
                func.sum(
                    case(
                        (
                            and_(
                                Report.first_submitted_at.is_not(None),
                                Report.first_submitted_at > deadline,
                            ),
                            1,
                        ),
                        else_=0,
                    )
                ).label("late"),
            )
            .select_from(Report)
            .join(User, User.id == Report.user_id)
            .where(
                Report.week_start == week_start,
                User.is_active.is_(True),
                User.role_id == self._member_role_id(),
            )
        )
        if project_id:
            stmt = stmt.where(Report.project_id == project_id)

        row = self.db.execute(stmt).one()
        return {key: int(value or 0) for key, value in row._mapping.items()}

    def open_blockers(self, week_start: date) -> tuple[int, int]:
        """(open blockers, of which flagged as the key issue) for a week."""
        stmt = (
            select(
                func.count().label("total"),
                func.sum(case((Blocker.is_key.is_(True), 1), else_=0)).label("key"),
            )
            .select_from(Blocker)
            .join(Report, Report.id == Blocker.report_id)
            .where(
                Report.week_start == week_start,
                Blocker.is_resolved.is_(False),
                Report.status != ReportStatus.APPROVED,
            )
        )
        row = self.db.execute(stmt).one()
        return int(row.total or 0), int(row.key or 0)

    def task_totals(self, week_start: date) -> tuple[int, int, Decimal]:
        """(tasks, completed tasks, hours spent) across the week."""
        stmt = (
            select(
                func.count(ReportTask.id),
                func.sum(case((ReportTask.status == TaskStatus.COMPLETED, 1), else_=0)),
                func.coalesce(func.sum(ReportTask.hours_spent), 0),
            )
            .select_from(ReportTask)
            .join(Report, Report.id == ReportTask.report_id)
            .where(Report.week_start == week_start)
        )
        total, completed, hours = self.db.execute(stmt).one()
        return int(total or 0), int(completed or 0), Decimal(str(hours or 0))

    # ----------------------------------------------------------------- charts

    def status_by_member(self, date_from: date, date_to: date) -> list[Row]:
        """One row per member with per-status counts — ONE query for the whole
        stacked bar, not one per member."""
        stmt = (
            select(
                User.id,
                User.full_name,
                func.sum(case((Report.status == ReportStatus.DRAFT, 1), else_=0)).label("draft"),
                func.sum(case((Report.status == ReportStatus.SUBMITTED, 1), else_=0)).label(
                    "submitted"
                ),
                func.sum(
                    case((Report.status == ReportStatus.NEEDS_CORRECTION, 1), else_=0)
                ).label("needs_correction"),
                func.sum(case((Report.status == ReportStatus.APPROVED, 1), else_=0)).label(
                    "approved"
                ),
                func.sum(case((Report.id.is_(None), 1), else_=0)).label("not_started"),
            )
            .select_from(User)
            .outerjoin(
                Report,
                and_(
                    Report.user_id == User.id,
                    Report.week_start >= date_from,
                    Report.week_start <= date_to,
                ),
            )
            .where(User.is_active.is_(True), User.role_id == self._member_role_id())
            .group_by(User.id, User.full_name)
            .order_by(User.full_name)
        )
        return list(self.db.execute(stmt).all())

    def task_trend(self, weeks: list[date]) -> list[Row]:
        """Completed vs total tasks per week, team-wide."""
        stmt = (
            select(
                Report.week_start,
                func.count(ReportTask.id).label("total_tasks"),
                func.sum(
                    case((ReportTask.status == TaskStatus.COMPLETED, 1), else_=0)
                ).label("completed_tasks"),
                func.coalesce(func.sum(ReportTask.hours_spent), 0).label("hours_spent"),
            )
            .select_from(Report)
            .outerjoin(ReportTask, ReportTask.report_id == Report.id)
            .where(Report.week_start.in_(weeks))
            .group_by(Report.week_start)
            .order_by(Report.week_start)
        )
        return list(self.db.execute(stmt).all())

    def workload_by_project(self, date_from: date, date_to: date) -> list[Row]:
        """Task counts and hours per project.

        COALESCE on the task's project falls back to the report's, so the
        numbers are right whether or not a task overrides the report tag.
        """
        effective_project = func.coalesce(ReportTask.project_id, Report.project_id)
        stmt = (
            select(
                Project.id,
                Project.name,
                Project.color,
                func.count(ReportTask.id).label("task_count"),
                func.coalesce(func.sum(ReportTask.hours_spent), 0).label("hours_spent"),
            )
            .select_from(ReportTask)
            .join(Report, Report.id == ReportTask.report_id)
            .join(Project, Project.id == effective_project)
            .where(Report.week_start >= date_from, Report.week_start <= date_to)
            .group_by(Project.id, Project.name, Project.color)
            .order_by(func.count(ReportTask.id).desc())
        )
        return list(self.db.execute(stmt).all())

    def time_by_task_type(self, date_from: date, date_to: date) -> list[Row]:
        stmt = (
            select(
                ReportHours.task_type,
                func.coalesce(func.sum(ReportHours.hours), 0).label("hours"),
            )
            .select_from(ReportHours)
            .join(Report, Report.id == ReportHours.report_id)
            .where(Report.week_start >= date_from, Report.week_start <= date_to)
            .group_by(ReportHours.task_type)
            .order_by(func.sum(ReportHours.hours).desc())
        )
        return list(self.db.execute(stmt).all())

    # -------------------------------------------------------------- analytics

    def workload_balance(self, week_start: date) -> list[Row]:
        """Hours and task counts per member — the input for imbalance detection.

        Computed in SQL so the numbers are exact and cheap; the AI assistant
        only turns them into prose.
        """
        stmt = (
            select(
                User.id,
                User.full_name,
                func.count(ReportTask.id).label("task_count"),
                func.coalesce(func.sum(ReportTask.hours_spent), 0).label("hours_spent"),
            )
            .select_from(User)
            .outerjoin(
                Report, and_(Report.user_id == User.id, Report.week_start == week_start)
            )
            .outerjoin(ReportTask, ReportTask.report_id == Report.id)
            .where(User.is_active.is_(True), User.role_id == self._member_role_id())
            .group_by(User.id, User.full_name)
            .order_by(func.coalesce(func.sum(ReportTask.hours_spent), 0).desc())
        )
        return list(self.db.execute(stmt).all())

    def recurring_blockers(self, date_from: date, date_to: date, limit: int = 10) -> list[Row]:
        """Blockers grouped by text, to surface issues that keep coming back."""
        stmt = (
            select(
                Blocker.description,
                func.count(Blocker.id).label("occurrences"),
                func.count(func.distinct(Report.user_id)).label("affected_members"),
                func.sum(case((Blocker.is_key.is_(True), 1), else_=0)).label("times_key"),
            )
            .select_from(Blocker)
            .join(Report, Report.id == Blocker.report_id)
            .where(Report.week_start >= date_from, Report.week_start <= date_to)
            .group_by(Blocker.description)
            .having(func.count(Blocker.id) > 1)
            .order_by(func.count(Blocker.id).desc())
            .limit(limit)
        )
        return list(self.db.execute(stmt).all())

    def member_stats(self, user_id: int) -> Row:
        """Aggregate stats for the member profile page."""
        stmt = (
            select(
                func.count(Report.id).label("total_reports"),
                func.sum(case((Report.status == ReportStatus.APPROVED, 1), else_=0)).label(
                    "approved"
                ),
                func.sum(
                    case((Report.status == ReportStatus.NEEDS_CORRECTION, 1), else_=0)
                ).label("needs_correction"),
                func.sum(case((Report.status == ReportStatus.DRAFT, 1), else_=0)).label("drafts"),
                func.coalesce(func.avg(Report.submission_count), 0).label("avg_submissions"),
            )
            .select_from(Report)
            .where(Report.user_id == user_id)
        )
        return self.db.execute(stmt).one()
