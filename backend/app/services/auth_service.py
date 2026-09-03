"""Authentication business logic.

Note the absence of `fastapi` imports: this module raises domain exceptions and
knows nothing about HTTP, so it can be unit-tested without a client.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import AuthenticationError, ConflictError, NotFoundError
from app.core.security import (
    create_access_token,
    generate_refresh_token_value,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.models import RefreshToken, Role, RoleCode, User


class AuthService:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ---------------------------------------------------------------- register

    def register(self, *, email: str, password: str, full_name: str) -> User:
        email = email.strip().lower()
        if self.db.scalar(select(User).where(User.email == email)):
            raise ConflictError("An account with this email already exists", field="email")

        role = self.db.scalar(select(Role).where(Role.code == RoleCode.MEMBER.value))
        if role is None:
            raise NotFoundError(
                "Roles are not seeded. Run: python -m app.seeds.reference"
            )

        user = User(
            email=email,
            password_hash=hash_password(password),
            full_name=full_name,
            # Always MEMBER. The role is never taken from the request body.
            role_id=role.id,
            is_active=True,
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    # ------------------------------------------------------------------- login

    def authenticate(self, *, email: str, password: str) -> User:
        user = self.db.scalar(select(User).where(User.email == email.strip().lower()))

        # Identical message and comparable timing whether the email is unknown
        # or the password is wrong, so this endpoint is not a user-enumeration
        # oracle. The dummy verify keeps the bcrypt cost on the unknown-email
        # path too.
        if user is None:
            verify_password(password, hash_password("dummy-timing-equaliser"))
            raise AuthenticationError("Invalid email or password")

        if not verify_password(password, user.password_hash):
            raise AuthenticationError("Invalid email or password")

        if not user.is_active:
            raise AuthenticationError("This account has been deactivated")

        return user

    # ------------------------------------------------------------ access token

    def issue_access_token(self, user: User) -> tuple[str, int]:
        expires_in = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
        return create_access_token(user.id), expires_in

    # ----------------------------------------------------------- refresh token

    def issue_refresh_token(self, user: User, *, user_agent: str | None = None) -> str:
        """Create a refresh token, storing only its hash."""
        raw = generate_refresh_token_value()
        self.db.add(
            RefreshToken(
                user_id=user.id,
                token_hash=hash_refresh_token(raw),
                expires_at=datetime.utcnow()
                + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
                user_agent=(user_agent or "")[:255] or None,
            )
        )
        self.db.commit()
        return raw

    def rotate_refresh_token(
        self, raw_token: str, *, user_agent: str | None = None
    ) -> tuple[User, str]:
        """Validate a refresh token and replace it with a successor.

        Rotation is what makes theft detectable: a token presented after it has
        already been rotated can only be a replay, so the whole family is
        revoked rather than just refused.
        """
        row = self.db.scalar(
            select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw_token))
        )
        if row is None:
            raise AuthenticationError("Invalid refresh token")

        if row.revoked_at is not None:
            # Reuse detection: this token was already spent.
            self._revoke_all_for_user(row.user_id)
            raise AuthenticationError("Refresh token has been revoked. Please sign in again.")

        if row.expires_at <= datetime.utcnow():
            raise AuthenticationError("Refresh token has expired. Please sign in again.")

        user = self.db.get(User, row.user_id)
        if user is None or not user.is_active:
            raise AuthenticationError("Account is no longer active")

        row.revoked_at = datetime.utcnow()
        new_raw = generate_refresh_token_value()
        self.db.add(
            RefreshToken(
                user_id=user.id,
                token_hash=hash_refresh_token(new_raw),
                expires_at=datetime.utcnow()
                + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
                user_agent=(user_agent or "")[:255] or None,
            )
        )
        self.db.commit()
        return user, new_raw

    def revoke_refresh_token(self, raw_token: str) -> None:
        """Logout. Idempotent — an unknown or already-revoked token is fine."""
        row = self.db.scalar(
            select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw_token))
        )
        if row is not None and row.revoked_at is None:
            row.revoked_at = datetime.utcnow()
            self.db.commit()

    def _revoke_all_for_user(self, user_id: int) -> None:
        for row in self.db.scalars(
            select(RefreshToken).where(
                RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None)
            )
        ):
            row.revoked_at = datetime.utcnow()
        self.db.commit()

    # --------------------------------------------------------------- password

    def change_password(self, user: User, *, current: str, new: str) -> None:
        if not verify_password(current, user.password_hash):
            raise AuthenticationError("Current password is incorrect")
        user.password_hash = hash_password(new)
        # Every other session is invalidated — changing a password should end
        # sessions the user may not control.
        self._revoke_all_for_user(user.id)
        self.db.commit()
