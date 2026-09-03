"""Authentication and role gates.

These live in dependencies rather than middleware on purpose: middleware runs
before routing, so it cannot know which permission a route requires or which
object is being addressed. Dependencies are per-route, composable and
individually testable.
"""
from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.database.session import get_db
from app.models import User

# auto_error=False so a missing header produces our own 401 envelope rather
# than FastAPI's default shape.
bearer_scheme = HTTPBearer(auto_error=False)

_UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise _UNAUTHORIZED

    # expected_type="access" is what stops a refresh token authenticating a
    # normal request. Without it the 7-day credential would work everywhere and
    # the short access-token lifetime would buy nothing.
    payload = decode_token(credentials.credentials, expected_type="access")
    if payload is None:
        raise _UNAUTHORIZED

    try:
        user_id = int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        raise _UNAUTHORIZED from None

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        # A deactivated user's existing tokens stop working immediately.
        raise _UNAUTHORIZED
    return user


def require_permission(*required: str):
    """Route-level capability gate.

    Depends on a *permission code*, never a role name, so adding a role is a
    data change rather than a code change.

        @router.get(..., dependencies=[Depends(require_permission("dashboard.view"))])
    """

    def _check(user: User = Depends(get_current_user)) -> User:
        if not set(required).issubset(user.permission_codes):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )
        return user

    return _check


def require_manager(user: User = Depends(get_current_user)) -> User:
    """Convenience gate for routes that need "can see the whole team"."""
    if not user.is_manager:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to perform this action",
        )
    return user
