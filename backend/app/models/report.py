"""The weekly report and its child collections.

Structure is fixed and identical for every user, as the brief requires — these
tables *are* the schema of a report. There is no mechanism for a user to add,
reorder or customise fields, which is what keeps reports comparable across the
team on the manager's dashboard.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Computed,
    Date,

    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,

)
from sqlalchemy.dialects.mysql import TINYINT
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import NOW_6, Base, BigIntPK, TimestampMixin, utc_datetime
from app.models.enums import (
    BlockerSeverity,
    ReportStatus,
    TaskPriority,
    TaskStatus,
    TaskType,
)

if TYPE_CHECKING:
    from app.models.project import Project
    from app.models.review import ReviewHistory
    from app.models.user import User
    from app.models.version import ReportVersion


def _enum(py_enum: type) -> Enum:
    """MySQL ENUM storing the member *value*."""
    return Enum(py_enum, native_enum=True, values_callable=lambda e: [m.value for m in e])


class Report(Base, TimestampMixin):
    """One week of work for one person — the container the workflow acts on."""

    __tablename__ = "reports"
    __table_args__ = (
        # One report per person per week. The UI also disables already-used
        # weeks, but this is what actually guarantees it under a race.
        UniqueConstraint("user_id", "week_start", name="uq_reports_user_week"),
        Index("idx_reports_week_status", "week_start", "status"),
        Index("idx_reports_user_week", "user_id", "week_start"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigIntPK, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    project_id: Mapped[int] = mapped_column(
        BigIntPK, ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    # Always the ISO Monday, normalised server-side. The client never decides
    # week identity — otherwise a member in another timezone files against the
    # wrong week and trips the unique constraint.
    week_start: Mapped[date] = mapped_column(Date, nullable=False)
    # Derived in the database so it can never drift from week_start.
    # nullable=True is required, not cosmetic: MariaDB rejects NOT NULL on a
    # generated column (MySQL 8 allows it). The value is never actually null,
    # since week_start is NOT NULL and the expression is total.
    week_end: Mapped[date] = mapped_column(
        Date, Computed("week_start + INTERVAL 6 DAY", persisted=True), nullable=True
    )

    status: Mapped[ReportStatus] = mapped_column(
        _enum(ReportStatus), default=ReportStatus.DRAFT, nullable=False, index=True
    )
    current_version_no: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    submission_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Lateness is judged on the FIRST submission, so correcting a report never
    # makes it retroactively late. That is why these are two columns.
    first_submitted_at: Mapped[datetime | None] = mapped_column(utc_datetime())
    last_submitted_at: Mapped[datetime | None] = mapped_column(utc_datetime())

    reviewed_at: Mapped[datetime | None] = mapped_column(utc_datetime())
    reviewed_by: Mapped[int | None] = mapped_column(
        BigIntPK, ForeignKey("users.id", ondelete="SET NULL")
    )

    notes: Mapped[str | None] = mapped_column(Text)
    links: Mapped[list | None] = mapped_column(JSON)

    user: Mapped[User] = relationship(
        back_populates="reports", foreign_keys=[user_id], lazy="joined"
    )
    reviewer: Mapped[User | None] = relationship(foreign_keys=[reviewed_by])
    project: Mapped[Project] = relationship(lazy="joined")

    # selectin, not the default lazy="select": rendering a report needs every
    # child collection, and selectin fetches each in ONE extra query keyed by
    # parent id. A list of 20 reports costs 1 + 5 queries rather than 101.
    tasks: Mapped[list[ReportTask]] = relationship(
        back_populates="report", cascade="all, delete-orphan",
        order_by="ReportTask.order_index", lazy="selectin",
    )
    next_week_tasks: Mapped[list[NextWeekTask]] = relationship(
        cascade="all, delete-orphan", order_by="NextWeekTask.order_index", lazy="selectin",
    )
    blockers: Mapped[list[Blocker]] = relationship(
        cascade="all, delete-orphan", order_by="Blocker.order_index", lazy="selectin",
    )
    achievements: Mapped[list[Achievement]] = relationship(
        cascade="all, delete-orphan", order_by="Achievement.order_index", lazy="selectin",
    )
    hours: Mapped[list[ReportHours]] = relationship(
        cascade="all, delete-orphan", lazy="selectin",
    )
    versions: Mapped[list[ReportVersion]] = relationship(
        back_populates="report", cascade="all, delete-orphan",
        order_by="ReportVersion.version_no.desc()",
    )
    reviews: Mapped[list[ReviewHistory]] = relationship(
        back_populates="report", cascade="all, delete-orphan",
        order_by="(ReviewHistory.created_at.desc(), ReviewHistory.id.desc())",
    )

    @property
    def is_editable(self) -> bool:
        return self.status in (ReportStatus.DRAFT, ReportStatus.NEEDS_CORRECTION)

    @property
    def key_blocker(self) -> Blocker | None:
        return next((b for b in self.blockers if b.is_key), None)

    @property
    def key_achievement(self) -> Achievement | None:
        return next((a for a in self.achievements if a.is_key), None)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Report {self.id} user={self.user_id} week={self.week_start} {self.status}>"


class ReportTask(Base):
    """The task-level table the brief specifies field by field."""

    __tablename__ = "report_tasks"
    __table_args__ = (
        CheckConstraint("planned_pct BETWEEN 0 AND 100", name="ck_tasks_planned"),
        CheckConstraint("actual_pct BETWEEN 0 AND 100", name="ck_tasks_actual"),
        CheckConstraint("hours_planned >= 0 AND hours_spent >= 0", name="ck_tasks_hours"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    report_id: Mapped[int] = mapped_column(
        BigIntPK, ForeignKey("reports.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Optional override of the report's project. Analytics use
    # COALESCE(task.project_id, report.project_id) so per-project workload is
    # correct whether or not the override is used.
    project_id: Mapped[int | None] = mapped_column(
        BigIntPK, ForeignKey("projects.id", ondelete="SET NULL")
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    priority: Mapped[TaskPriority] = mapped_column(
        _enum(TaskPriority), default=TaskPriority.MEDIUM, nullable=False
    )
    status: Mapped[TaskStatus] = mapped_column(
        _enum(TaskStatus), default=TaskStatus.IN_PROGRESS, nullable=False, index=True
    )
    planned_pct: Mapped[int] = mapped_column(TINYINT(unsigned=True), default=0, nullable=False)
    actual_pct: Mapped[int] = mapped_column(TINYINT(unsigned=True), default=0, nullable=False)
    # DECIMAL, never FLOAT: binary floating point cannot represent 0.1, and
    # these values get summed for charts and compared.
    hours_planned: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0, nullable=False)
    hours_spent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0, nullable=False)
    deliverable: Mapped[str | None] = mapped_column(String(500))
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(utc_datetime(), server_default=NOW_6)

    report: Mapped[Report] = relationship(back_populates="tasks")


class NextWeekTask(Base):
    __tablename__ = "report_next_week_tasks"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    report_id: Mapped[int] = mapped_column(
        BigIntPK, ForeignKey("reports.id", ondelete="CASCADE"), nullable=False, index=True
    )
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    priority: Mapped[TaskPriority] = mapped_column(
        _enum(TaskPriority), default=TaskPriority.MEDIUM, nullable=False
    )
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Blocker(Base):
    """A challenge for the week, at most one flagged as *the* key issue.

    MariaDB/MySQL have no partial indexes, so the "exactly one" rule is enforced
    by a stored generated column plus a unique index: duplicate NULLs do not
    collide, so unflagged rows are unconstrained while at most one flagged row
    can exist per report. Verified against MariaDB 10.4.
    """

    __tablename__ = "report_blockers"
    __table_args__ = (
        UniqueConstraint("key_guard", name="uq_blockers_one_key"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    report_id: Mapped[int] = mapped_column(
        BigIntPK, ForeignKey("reports.id", ondelete="CASCADE"), nullable=False, index=True
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[BlockerSeverity] = mapped_column(
        _enum(BlockerSeverity), default=BlockerSeverity.MEDIUM, nullable=False
    )
    is_key: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Backs the "open blockers across the team" dashboard metric.
    is_resolved: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, index=True
    )
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(utc_datetime(), server_default=NOW_6)

    key_guard: Mapped[int | None] = mapped_column(
        BigIntPK, Computed("IF(is_key, report_id, NULL)", persisted=True)
    )


class Achievement(Base):
    """Same shape and same one-key rule as Blocker."""

    __tablename__ = "report_achievements"
    __table_args__ = (
        UniqueConstraint("key_guard", name="uq_achievements_one_key"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    report_id: Mapped[int] = mapped_column(
        BigIntPK, ForeignKey("reports.id", ondelete="CASCADE"), nullable=False, index=True
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    is_key: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(utc_datetime(), server_default=NOW_6)

    key_guard: Mapped[int | None] = mapped_column(
        BigIntPK, Computed("IF(is_key, report_id, NULL)", persisted=True)
    )


class ReportHours(Base):
    """Hours worked broken down by task type."""

    __tablename__ = "report_hours"
    __table_args__ = (
        # One row per type per report, so the chart cannot double-count.
        UniqueConstraint("report_id", "task_type", name="uq_hours_report_type"),
        CheckConstraint("hours >= 0", name="ck_hours_positive"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    report_id: Mapped[int] = mapped_column(
        BigIntPK, ForeignKey("reports.id", ondelete="CASCADE"), nullable=False
    )
    task_type: Mapped[TaskType] = mapped_column(_enum(TaskType), nullable=False)
    hours: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0, nullable=False)
