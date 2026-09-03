"""Report queries.

Repositories build and run queries. They never raise HTTPException and never
make business decisions — and they flush rather than commit, because the
service owns the transaction boundary.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session, selectinload

from app.models import Report, ReportStatus, ReportTask, User


@dataclass
class ReportFilters:
    week_start: date | None = None
    date_from: date | None = None
    date_to: date | None = None
    user_id: int | None = None
    project_id: int | None = None
    statuses: list[ReportStatus] = field(default_factory=list)
    search: str | None = None
    sort: str = "-week_start"
    limit: int = 20
    offset: int = 0


_SORTABLE = {
    "week_start": Report.week_start,
    "status": Report.status,
    "updated_at": Report.updated_at,
    "last_submitted_at": Report.last_submitted_at,
}


class ReportRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ------------------------------------------------------------------ reads

    def get(self, report_id: int) -> Report | None:
        return self.db.get(Report, report_id)

    def get_for_week(self, user_id: int, week_start: date) -> Report | None:
        return self.db.scalar(
            select(Report).where(Report.user_id == user_id, Report.week_start == week_start)
        )

    def list(self, *, viewer: User, filters: ReportFilters) -> tuple[list[Report], int]:
        stmt = select(Report)
        stmt = self._apply_scope(stmt, viewer)
        stmt = self._apply_filters(stmt, filters)

        # Count on the filtered statement *before* limit/offset, so `total`
        # describes the whole result set rather than the current page.
        total = self.db.scalar(
            select(func.count()).select_from(stmt.subquery())
        ) or 0

        stmt = self._apply_sort(stmt, filters.sort).limit(filters.limit).offset(filters.offset)
        rows = self.db.scalars(
            stmt.options(
                selectinload(Report.tasks),
                selectinload(Report.blockers),
            )
        ).unique().all()
        return list(rows), total

    # ----------------------------------------------------------------- helpers

    @staticmethod
    def _apply_scope(stmt: Select, viewer: User) -> Select:
        """THE scoping line.

        Applied in SQL and before limit/offset, so an unauthorised row is never
        loaded into memory and the pagination count stays correct. Filtering in
        Python after the fetch would break both.
        """
        if not viewer.is_manager:
            stmt = stmt.where(Report.user_id == viewer.id)
        return stmt

    @staticmethod
    def _apply_filters(stmt: Select, f: ReportFilters) -> Select:
        if f.week_start:
            stmt = stmt.where(Report.week_start == f.week_start)
        if f.date_from:
            stmt = stmt.where(Report.week_start >= f.date_from)
        if f.date_to:
            stmt = stmt.where(Report.week_start <= f.date_to)
        if f.user_id:
            # ANDed with the scope clause above, so a member passing another
            # member's id gets an empty list rather than their data.
            stmt = stmt.where(Report.user_id == f.user_id)
        if f.project_id:
            stmt = stmt.where(Report.project_id == f.project_id)
        if f.statuses:
            stmt = stmt.where(Report.status.in_(f.statuses))
        if f.search:
            term = f"%{f.search.strip()}%"
            stmt = stmt.where(
                Report.notes.ilike(term)
                | Report.id.in_(
                    select(ReportTask.report_id).where(ReportTask.name.ilike(term))
                )
            )
        return stmt

    @staticmethod
    def _apply_sort(stmt: Select, sort: str) -> Select:
        descending = sort.startswith("-")
        column = _SORTABLE.get(sort.lstrip("-"), Report.week_start)
        # Secondary key on id keeps pagination stable when the sort key ties —
        # without it, rows can repeat or vanish between pages.
        return stmt.order_by(
            column.desc() if descending else column.asc(),
            Report.id.desc(),
        )

    # ----------------------------------------------------------------- writes

    def add(self, report: Report) -> Report:
        self.db.add(report)
        self.db.flush()  # assigns the PK; the SERVICE commits
        return report

    def delete(self, report: Report) -> None:
        self.db.delete(report)
        self.db.flush()
