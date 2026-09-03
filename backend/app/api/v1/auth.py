"""Authentication routes.

Thin by design: parse, delegate to AuthService, shape the HTTP response. The
only logic here is cookie handling, which is genuinely an HTTP concern.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import AuthenticationError
from app.database.session import get_db
from app.dependencies.auth import get_current_user
from app.models import User
from app.schemas.auth import (
    AccessTokenResponse,
    ChangePasswordRequest,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
)
from app.schemas.user import CurrentUser, UserOut
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


def _to_current_user(user: User) -> CurrentUser:
    return CurrentUser(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        job_title=user.job_title,
        avatar_url=user.avatar_url,
        is_active=user.is_active,
        role=user.role,
        created_at=user.created_at,
        permissions=sorted(user.permission_codes),
    )


def _set_refresh_cookie(response: Response, token: str) -> None:
    """HttpOnly so no script can read it; path-scoped so it is only sent to the
    auth routes that actually need it."""
    response.set_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        path=settings.REFRESH_COOKIE_PATH,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        path=settings.REFRESH_COOKIE_PATH,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
    )


@router.post(
    "/register",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create an account",
)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> User:
    return AuthService(db).register(
        email=payload.email, password=payload.password, full_name=payload.full_name
    )


@router.post("/login", response_model=TokenResponse, summary="Sign in")
def login(
    payload: LoginRequest,
    response: Response,
    request: Request,
    db: Session = Depends(get_db),
) -> TokenResponse:
    service = AuthService(db)
    user = service.authenticate(email=payload.email, password=payload.password)

    access_token, expires_in = service.issue_access_token(user)
    refresh = service.issue_refresh_token(user, user_agent=request.headers.get("user-agent"))
    _set_refresh_cookie(response, refresh)

    return TokenResponse(
        access_token=access_token, expires_in=expires_in, user=_to_current_user(user)
    )


@router.post(
    "/refresh", response_model=AccessTokenResponse, summary="Exchange the refresh cookie"
)
def refresh_token(
    request: Request, response: Response, db: Session = Depends(get_db)
) -> AccessTokenResponse:
    raw = request.cookies.get(settings.REFRESH_COOKIE_NAME)
    if not raw:
        raise AuthenticationError("No refresh token provided")

    service = AuthService(db)
    try:
        user, new_refresh = service.rotate_refresh_token(
            raw, user_agent=request.headers.get("user-agent")
        )
    except AuthenticationError:
        # A dead cookie is worse than none: it makes every future refresh fail
        # in the same way with no path to recovery.
        _clear_refresh_cookie(response)
        raise

    _set_refresh_cookie(response, new_refresh)
    access_token, expires_in = service.issue_access_token(user)
    return AccessTokenResponse(access_token=access_token, expires_in=expires_in)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    # Both are required for a 204: FastAPI otherwise infers a response model
    # from the `-> None` return annotation, and a 204 must not carry a body.
    response_model=None,
    response_class=Response,
    summary="Sign out",
)
def logout(request: Request, response: Response, db: Session = Depends(get_db)) -> None:
    raw = request.cookies.get(settings.REFRESH_COOKIE_NAME)
    if raw:
        # Revoking the row is what makes logout real rather than a client-side
        # token drop — JWTs themselves cannot be revoked before they expire.
        AuthService(db).revoke_refresh_token(raw)
    _clear_refresh_cookie(response)


@router.get("/me", response_model=CurrentUser, summary="The signed-in user")
def me(user: User = Depends(get_current_user)) -> CurrentUser:
    return _to_current_user(user)


@router.post(
    "/change-password",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    response_class=Response,
    summary="Change password and end other sessions",
)
def change_password(
    payload: ChangePasswordRequest,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    AuthService(db).change_password(
        user, current=payload.current_password, new=payload.new_password
    )
    _clear_refresh_cookie(response)
