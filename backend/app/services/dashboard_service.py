"""Dashboard metric assembly.

Every metric here has a definition that can be defended out loud. Vague numbers
are how a dashboard loses credibility.
"""
from __future__ import annotations

import statistics
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import ActivityLog
from app.repositories.dashboard_repository import DashboardRepository
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
    WorkloadBalanceRow,
)
from app.schemas.user import UserBrief
from app.services.activity_service import ActivityService
from app.utils.week import format_week, week_end_of, week_range

#: Deviations from the team mean beyond this are flagged as an imbalance.
IMBALANCE_SIGMA = 1.0


class DashboardService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = DashboardRepository(db)
        self.activity = ActivityService(db)

    # ---------------------------------------------------------------- summary

    def summary(self, week_start: date, *, project_id: int | None = None) -> DashboardSummary:
        counts = self.repo.week_counts(week_start, project_id=project_id)
        total_members = self.repo.active_member_count()
        open_blockers, key_blockers = self.repo.open_blockers(week_start)
        total_tasks, completed_tasks, hours = self.repo.task_totals(week_start)

        # not_started cannot come from the reports table: these members have no
        # row there at all. It is the roster minus whoever has a report.
        not_started = max(total_members - counts["total"], 0)
        submitted = counts["submitted_total"]
        compliance = (submitted / total_members) if total_members else 0.0

        previous = self.repo.week_counts(
            week_start - timedelta(days=7), project_id=project_id
        )
        prev_submitted = previous["submitted_total"]
        prev_compliance = (prev_submitted / total_members) if total_members else 0.0

        return DashboardSummary(
            week_start=week_start,
            week_end=week_end_of(week_start),
            total_members=total_members,
            submitted=submitted,
            approved=counts["approved"],
            needs_correction=counts["needs_correction"],
            pending=counts["draft"],
            not_started=not_started,
            late=counts["late"],
            compliance_rate=round(compliance, 4),
            open_blockers=open_blockers,
            key_blockers=key_blockers,
            total_tasks=total_tasks,
            completed_tasks=completed_tasks,
            total_hours=hours,
            deltas={
                "submitted": submitted - prev_submitted,
                "compliance_rate": round(compliance - prev_compliance, 4),
            },
        )

    # ------------------------------------------------------------ team status

    def team_status(
        self, week_start: date, *, project_id: int | None = None
    ) -> list[TeamStatusRow]:
        return [
            TeamStatusRow(
                user=UserBrief(
                    id=row.user_id, full_name=row.full_name, avatar_url=row.avatar_url
                ),
                job_title=row.job_title,
                report_id=row.report_id,
                # A member with no report row surfaces as NOT_STARTED rather
                # than being absent from the list entirely.
                status=row.status if isinstance(row.status, str) else row.status.value,
                project_id=row.project_id,
                project_name=row.project_name,
                project_color=row.project_color,
                current_version_no=row.current_version_no or 0,
                submission_count=row.submission_count or 0,
                first_submitted_at=row.first_submitted_at,
                is_late=bool(row.is_late),
            )
            for row in self.repo.team_status(week_start, project_id=project_id)
        ]

    # ----------------------------------------------------------------- charts

    def status_by_member(self, date_from: date, date_to: date) -> list[StatusByMemberRow]:
        return [
            StatusByMemberRow(
                user_id=row.id,
                full_name=row.full_name,
                draft=int(row.draft or 0),
                submitted=int(row.submitted or 0),
                needs_correction=int(row.needs_correction or 0),
                approved=int(row.approved or 0),
                not_started=int(row.not_started or 0),
            )
            for row in self.repo.status_by_member(date_from, date_to)
        ]

    def task_trend(self, *, weeks: int, ending: date | None = None) -> list[TaskTrendPoint]:
        wanted = week_range(weeks=weeks, ending=ending)
        by_week = {row.week_start: row for row in self.repo.task_trend(wanted)}
        # Weeks with no data still appear, as zeros — a gap in a trend line is
        # information, and an absent point silently rescales the axis.
        return [
            TaskTrendPoint(
                week_start=week,
                label=format_week(week),
                total_tasks=int(getattr(by_week.get(week), "total_tasks", 0) or 0),
                completed_tasks=int(getattr(by_week.get(week), "completed_tasks", 0) or 0),
                hours_spent=Decimal(str(getattr(by_week.get(week), "hours_spent", 0) or 0)),
            )
            for week in wanted
        ]

    def workload_by_project(self, date_from: date, date_to: date) -> list[ProjectWorkloadRow]:
        return [
            ProjectWorkloadRow(
                project_id=row.id,
                name=row.name,
                color=row.color,
                task_count=int(row.task_count or 0),
                hours_spent=Decimal(str(row.hours_spent or 0)),
            )
            for row in self.repo.workload_by_project(date_from, date_to)
        ]

    def time_by_task_type(self, date_from: date, date_to: date) -> list[TimeByTypeRow]:
        return [
            TimeByTypeRow(
                task_type=row.task_type.value
                if hasattr(row.task_type, "value")
                else str(row.task_type),
                hours=Decimal(str(row.hours or 0)),
            )
            for row in self.repo.time_by_task_type(date_from, date_to)
        ]

    # --------------------------------------------------------------- activity

    def activity_feed(self, limit: int = 20, offset: int = 0) -> tuple[list[ActivityItem], int]:
        rows, total = self.activity.recent(limit=limit, offset=offset)
        return [self._to_activity_item(row) for row in rows], total

    @staticmethod
    def _to_activity_item(row: ActivityLog) -> ActivityItem:
        actor_name = row.actor.full_name if row.actor else "Someone"
        meta = row.meta or {}
        week = meta.get("week_start", "")
        author = meta.get("author")

        phrases = {
            "SUBMITTED": f"{actor_name} submitted their report for the week of {week}",
            "APPROVE": f"{actor_name} approved {author}'s report for the week of {week}",
            "REQUEST_CHANGES": (
                f"{actor_name} sent {author}'s report for the week of {week} "
                "back for correction"
            ),
        }
        return ActivityItem(
            id=row.id,
            action=row.action,
            entity_type=row.entity_type,
            entity_id=row.entity_id,
            actor=UserBrief(
                id=row.actor.id,
                full_name=row.actor.full_name,
                avatar_url=row.actor.avatar_url,
            )
            if row.actor
            else None,
            summary=phrases.get(row.action, f"{actor_name} {row.action.lower()}"),
            created_at=row.created_at,
        )

    # -------------------------------------------------------------- analytics

    def workload_balance(self, week_start: date) -> WorkloadBalance:
        rows = self.repo.workload_balance(week_start)
        hours = [float(r.hours_spent or 0) for r in rows]

        mean = statistics.fmean(hours) if hours else 0.0
        # pstdev, not stdev: this is the whole team, not a sample of it. stdev
        # also raises on a single member, which is a real edge case here.
        sigma = statistics.pstdev(hours) if len(hours) > 1 else 0.0

        members = []
        for row in rows:
            value = float(row.hours_spent or 0)
            deviation = (value - mean) / sigma if sigma > 0 else 0.0
            flag = None
            if sigma > 0 and abs(deviation) >= IMBALANCE_SIGMA:
                flag = "overloaded" if deviation > 0 else "underloaded"
            members.append(
                WorkloadBalanceRow(
                    user_id=row.id,
                    full_name=row.full_name,
                    task_count=int(row.task_count or 0),
                    hours_spent=Decimal(str(row.hours_spent or 0)),
                    deviation=round(deviation, 2),
                    flag=flag,
                )
            )

        return WorkloadBalance(
            week_start=week_start,
            mean_hours=round(mean, 2),
            std_dev=round(sigma, 2),
            members=members,
        )

    def recurring_blockers(self, date_from: date, date_to: date) -> list[RecurringBlocker]:
        return [
            RecurringBlocker(
                description=row.description,
                occurrences=int(row.occurrences),
                affected_members=int(row.affected_members),
                times_key=int(row.times_key or 0),
            )
            for row in self.repo.recurring_blockers(date_from, date_to)
        ]
