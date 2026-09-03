"""Identity: roles, permissions, users and refresh tokens."""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import NOW_6, Base, BigIntPK, SmallIntPK, TimestampMixin, utc_datetime

if TYPE_CHECKING:
    from app.models.report import Report


class Role(Base):
    """Role vocabulary as data rather than a hardcoded enum, so adding a fourth
    role is an INSERT plus grants — not a schema migration."""

    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(SmallIntPK, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(utc_datetime(), server_default=NOW_6)

    permissions: Mapped[list[PermissionModel]] = relationship(
        secondary="role_permissions", back_populates="roles", lazy="selectin"
    )
    users: Mapped[list[User]] = relationship(back_populates="role")

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Role {self.code}>"


class PermissionModel(Base):
    """A capability code such as ``report.review``."""

    __tablename__ = "permissions"

    id: Mapped[int] = mapped_column(SmallIntPK, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))

    roles: Mapped[list[Role]] = relationship(
        secondary="role_permissions", back_populates="permissions"
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Permission {self.code}>"


class RolePermission(Base):
    __tablename__ = "role_permissions"

    role_id: Mapped[int] = mapped_column(
        SmallIntPK, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True
    )
    permission_id: Mapped[int] = mapped_column(
        SmallIntPK, ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True
    )


class User(Base, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = (
        # Covers the compliance roster query: active members for a week.
        Index("idx_users_active_role", "is_active", "role_id"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    # bcrypt hash. Never appears in any response model.
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)

    role_id: Mapped[int] = mapped_column(
        SmallIntPK, ForeignKey("roles.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    manager_id: Mapped[int | None] = mapped_column(
        BigIntPK, ForeignKey("users.id", ondelete="SET NULL"), index=True
    )

    job_title: Mapped[str | None] = mapped_column(String(100))
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    # Deactivate rather than delete — reports and the audit trail must survive.
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    role: Mapped[Role] = relationship(back_populates="users", lazy="joined")
    manager: Mapped[User | None] = relationship(remote_side="User.id", lazy="selectin")
    reports: Mapped[list[Report]] = relationship(
        back_populates="user", foreign_keys="Report.user_id"
    )
    refresh_tokens: Mapped[list[RefreshToken]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    @property
    def permission_codes(self) -> set[str]:
        return {p.code for p in self.role.permissions}

    @property
    def role_code(self) -> str:
        return self.role.code

    @property
    def is_manager(self) -> bool:
        """True for anyone who may read the whole team's reports."""
        return self.role.code in ("MANAGER", "ADMIN")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<User {self.email} ({self.role_code})>"


class RefreshToken(Base):
    """Server-side half of the auth pair.

    Stores a SHA-256 *hash* of the token, so a database dump yields no usable
    sessions. Rotation on every refresh makes replay of a revoked token
    detectable, which is how we spot theft.
    """

    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigIntPK, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(utc_datetime(), nullable=False, index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(utc_datetime())
    user_agent: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(utc_datetime(), server_default=NOW_6)

    user: Mapped[User] = relationship(back_populates="refresh_tokens")

    @property
    def is_active(self) -> bool:
        return self.revoked_at is None and self.expires_at > datetime.utcnow()
