"""Projects and project membership."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import NOW_6, Base, BigIntPK, TimestampMixin, utc_datetime


class Project(Base, TimestampMixin):
    """A work category a report can be tagged with.

    Deletion is a soft archive when the project is referenced: hard-deleting one
    used by historical reports would either destroy history or fail the foreign
    key. The API keeps DELETE and archives instead, reporting which happened.
    """

    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    # Assigned from the fixed categorical palette slot order, so a project keeps
    # its colour everywhere and filtering never repaints the survivors.
    color: Mapped[str] = mapped_column(String(7), default="#2a78d6", nullable=False)
    is_archived: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, index=True
    )
    created_by: Mapped[int | None] = mapped_column(
        BigIntPK, ForeignKey("users.id", ondelete="SET NULL")
    )

    members: Mapped[list[ProjectMember]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Project {self.code}>"


class ProjectMember(Base):
    __tablename__ = "project_members"

    project_id: Mapped[int] = mapped_column(
        BigIntPK, ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(
        BigIntPK, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    assigned_at: Mapped[datetime] = mapped_column(utc_datetime(), server_default=NOW_6)

    project: Mapped[Project] = relationship(back_populates="members")
