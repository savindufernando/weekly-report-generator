"""Immutable report snapshots — the heart of the version-history requirement."""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, BigIntPK, utc_datetime

if TYPE_CHECKING:
    from app.models.report import Report
    from app.models.review import ReviewHistory
    from app.models.user import User


class ReportVersion(Base):
    """A frozen copy of a report's content at the moment it was submitted.

    Written once, never updated or deleted. The only write is an INSERT during
    ``submit``.

    Why a JSON snapshot rather than versioning the six child tables: that would
    mean a version_no on each, six times the write volume, and every query
    filtering by version forever. Versioning by diff would be smaller but needs
    reconstruction logic to display a version — pure cost for a feature that
    only has to show "a simple list of past versions, viewable on demand".

    The snapshot denormalises names (project name, not just id) on purpose: if a
    project is renamed later, an old version must still read as it did at the
    time. An id-only snapshot would silently rewrite history.
    """

    __tablename__ = "report_versions"
    __table_args__ = (
        # Makes a double-submit race impossible at the storage layer rather
        # than merely unlikely.
        UniqueConstraint("report_id", "version_no", name="uq_versions_report_no"),
        Index("idx_versions_report", "report_id", "version_no"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    report_id: Mapped[int] = mapped_column(
        BigIntPK, ForeignKey("reports.id", ondelete="CASCADE"), nullable=False
    )
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[dict] = mapped_column(JSON, nullable=False)
    # Detects a resubmit with no actual change, so we can tell the user rather
    # than silently creating an identical version.
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(utc_datetime(), nullable=False)
    submitted_by: Mapped[int] = mapped_column(
        BigIntPK, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    report: Mapped[Report] = relationship(back_populates="versions")
    submitter: Mapped[User] = relationship(lazy="joined")
    reviews: Mapped[list[ReviewHistory]] = relationship(back_populates="version")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<ReportVersion report={self.report_id} v{self.version_no}>"
