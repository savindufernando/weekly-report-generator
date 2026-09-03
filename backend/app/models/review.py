"""Review actions and the generic activity log."""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Enum, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import NOW_6, Base, BigIntPK, utc_datetime
from app.models.enums import ReportStatus, ReviewAction

if TYPE_CHECKING:
    from app.models.report import Report
    from app.models.user import User
    from app.models.version import ReportVersion


def _enum(py_enum: type) -> Enum:
    return Enum(py_enum, native_enum=True, values_callable=lambda e: [m.value for m in e])


class ReviewHistory(Base):
    """One row per review action a manager takes.

    The critical column is ``report_version_id``: a comment points at the exact
    version it was written against. Without it there is no way to answer "which
    version was this comment about?", which the brief asks for explicitly.

    Because this is a row per action rather than a column on the report, the
    full history of previous review comments comes for free.
    """

    __tablename__ = "review_history"
    __table_args__ = (
        Index("idx_review_report_created", "report_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    report_id: Mapped[int] = mapped_column(
        BigIntPK, ForeignKey("reports.id", ondelete="CASCADE"), nullable=False
    )
    report_version_id: Mapped[int] = mapped_column(
        BigIntPK, ForeignKey("report_versions.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    reviewer_id: Mapped[int] = mapped_column(
        BigIntPK, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    action: Mapped[ReviewAction] = mapped_column(_enum(ReviewAction), nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)

    # Recording both ends makes the row a complete audit record, so the activity
    # feed reads without extra joins.
    previous_status: Mapped[ReportStatus] = mapped_column(_enum(ReportStatus), nullable=False)
    new_status: Mapped[ReportStatus] = mapped_column(_enum(ReportStatus), nullable=False)
    created_at: Mapped[datetime] = mapped_column(utc_datetime(), server_default=NOW_6)

    report: Mapped[Report] = relationship(back_populates="reviews")
    version: Mapped[ReportVersion] = relationship(back_populates="reviews")
    reviewer: Mapped[User] = relationship(lazy="joined")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Review {self.action} report={self.report_id}>"


class ActivityLog(Base):
    """Generic audit trail powering the dashboard feed.

    Polymorphic by (entity_type, entity_id) rather than a foreign key, because
    it spans reports, projects and users. Written by the service layer only —
    never by the client.
    """

    __tablename__ = "activity_logs"
    __table_args__ = (
        Index("idx_activity_entity", "entity_type", "entity_id"),
        Index("idx_activity_created", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    actor_id: Mapped[int | None] = mapped_column(
        BigIntPK, ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[int] = mapped_column(BigIntPK, nullable=False)
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    meta: Mapped[dict | None] = mapped_column("metadata", JSON)
    ip_address: Mapped[str | None] = mapped_column(String(45))
    created_at: Mapped[datetime] = mapped_column(utc_datetime(), server_default=NOW_6)

    actor: Mapped[User | None] = relationship(lazy="joined")
