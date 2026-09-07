"""User listing, profiles and role administration."""
from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, Query, Response, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError, PermissionDenied
from app.core.security import hash_password
from app.database.session import get_db
from app.dependencies.auth import get_current_user, require_permission
from app.dependencies.pagination import Pagination, pagination
from app.models import Report, Role, RoleCode, User
from app.repositories.dashboard_repository import DashboardRepository
from app.schemas.common import Page
from app.schemas.dashboard import MemberProfile
from app.schemas.user import UserBrief, UserCreate, UserCreated, UserOut, UserUpdate
from app.utils.week import current_week_start, week_range

router = APIRouter(prefix="/users", tags=["users"])

#: Ambiguous characters (0/O, 1/l/I) are excluded: this password gets read off a
#: screen and typed by hand, so transcription errors are the likely failure.
_PASSWORD_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _generate_password(length: int = 14) -> str:
    """A one-time password for an admin-created account.

    `secrets`, not `random`: the seeded PRNG the demo data uses is predictable
    by design, and must never reach anything that guards an account.
    """
    while True:
        candidate = "".join(secrets.choice(_PASSWORD_ALPHABET) for _ in range(length))
        # Guarantee the generated value satisfies the same rule the API enforces
        # on user-supplied passwords, rather than assuming it usually will.
        if any(c.isalpha() for c in candidate) and any(c.isdigit() for c in candidate):
            return candidate


class RoleAssignment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role_code: RoleCode


@router.get(
    "",
    response_model=Page[UserOut],
    dependencies=[Depends(require_permission("user.view_all"))],
    summary="List users",
)
def list_users(
    role: str | None = Query(None),
    is_active: bool | None = Query(None),
    search: str | None = Query(None, alias="q", max_length=200),
    page: Pagination = Depends(pagination),
    db: Session = Depends(get_db),
) -> Page[UserOut]:
    stmt = select(User).join(Role, Role.id == User.role_id)
    if role:
        stmt = stmt.where(Role.code == role.upper())
    if is_active is not None:
        stmt = stmt.where(User.is_active.is_(is_active))
    if search:
        term = f"%{search.strip()}%"
        stmt = stmt.where(User.full_name.ilike(term) | User.email.ilike(term))

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(User.full_name).limit(page.limit).offset(page.offset)
    ).unique().all()
    return Page[UserOut](
        items=list(rows), total=total, limit=page.limit, offset=page.offset
    )


@router.post(
    "",
    response_model=UserCreated,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("user.manage_roles"))],
    summary="Create an account for a team member",
)
def create_user(
    payload: UserCreate,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserCreated:
    """Admin-side onboarding, as an alternative to self-registration.

    The role comes from the body here — unlike `/auth/register`, where accepting
    one would be privilege escalation — because the caller has already passed
    the `user.manage_roles` gate.

    If no password is supplied the server generates one and returns it *once*.
    Only the hash is stored, so it cannot be read back afterwards; losing it
    means the account needs a new password rather than a lookup.
    """
    email = payload.email.strip().lower()
    if db.scalar(select(User).where(User.email == email)):
        raise ConflictError("An account with this email already exists", field="email")

    role = db.scalar(select(Role).where(Role.code == payload.role_code.value))
    if role is None:
        raise NotFoundError(f"Role {payload.role_code.value} does not exist")

    # Default to reporting to the admin doing the creating; an explicit
    # manager_id wins, and must point at someone who can actually review.
    manager_id = payload.manager_id or current.id
    manager = db.get(User, manager_id)
    if manager is None:
        raise NotFoundError("Manager not found")
    if not manager.is_manager:
        raise ConflictError("The assigned manager must be a manager or an admin")

    generated = None if payload.password else _generate_password()
    user = User(
        email=email,
        password_hash=hash_password(payload.password or generated),
        full_name=payload.full_name,
        job_title=payload.job_title,
        role_id=role.id,
        manager_id=manager_id,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return UserCreated(
        **UserOut.model_validate(user).model_dump(), temporary_password=generated
    )


@router.get(
    "/{user_id}/profile",
    response_model=MemberProfile,
    dependencies=[Depends(require_permission("user.view_all"))],
    summary="Member profile with stats and week-by-week history",
)
def member_profile(
    user_id: int, weeks: int = Query(12, ge=1, le=52), db: Session = Depends(get_db)
) -> MemberProfile:
    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError("User not found")

    stats_row = DashboardRepository(db).member_stats(user_id)
    total = int(stats_row.total_reports or 0)
    approved = int(stats_row.approved or 0)

    wanted = week_range(weeks=weeks, ending=current_week_start())
    filed = {
        r.week_start: r.status.value
        for r in db.scalars(
            select(Report).where(Report.user_id == user_id, Report.week_start.in_(wanted))
        )
    }

    return MemberProfile(
        user=UserBrief(id=user.id, full_name=user.full_name, avatar_url=user.avatar_url),
        email=user.email,
        job_title=user.job_title,
        role=user.role.code,
        manager=(
            UserBrief(
                id=user.manager.id,
                full_name=user.manager.full_name,
                avatar_url=user.manager.avatar_url,
            )
            if user.manager
            else None
        ),
        stats={
            "total_reports": total,
            "approved": approved,
            "needs_correction": int(stats_row.needs_correction or 0),
            "drafts": int(stats_row.drafts or 0),
            "approval_rate": round(approved / total, 4) if total else 0.0,
            "avg_submissions_per_report": round(float(stats_row.avg_submissions or 0), 2),
        },
        # Weeks the member never filed appear as NOT_STARTED rather than being
        # absent — the same roster-driven reasoning as the dashboard.
        weekly_status=[
            {"week_start": week.isoformat(), "status": filed.get(week, "NOT_STARTED")}
            for week in wanted
        ],
    )


@router.patch(
    "/{user_id}",
    response_model=UserOut,
    summary="Update a profile (self, or an admin)",
)
def update_user(
    user_id: int,
    payload: UserUpdate,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    if user_id != current.id and "user.manage_roles" not in current.permission_codes:
        raise PermissionDenied("You can only edit your own profile")

    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError("User not found")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user


@router.patch(
    "/{user_id}/role",
    response_model=UserOut,
    dependencies=[Depends(require_permission("user.manage_roles"))],
    summary="Assign a role",
)
def assign_role(
    user_id: int,
    payload: RoleAssignment,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    # No self-promotion, and no demoting yourself out of admin — either would
    # let the last admin lock everyone out of user management.
    if user_id == current.id:
        raise PermissionDenied("You cannot change your own role")

    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError("User not found")

    role = db.scalar(select(Role).where(Role.code == payload.role_code.value))
    if role is None:
        raise NotFoundError(f"Role {payload.role_code.value} does not exist")

    _guard_last_admin(db, user, new_role_code=payload.role_code.value)

    user.role_id = role.id
    db.commit()
    db.refresh(user)
    return user


@router.delete(
    "/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    response_class=Response,
    dependencies=[Depends(require_permission("user.manage_roles"))],
    summary="Deactivate a user",
)
def deactivate_user(
    user_id: int, current: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> None:
    """Deactivates rather than deletes.

    Reports reference users with ON DELETE RESTRICT, so a real delete would
    either fail or destroy history. Deactivating ends their access immediately
    while their reports and the audit trail survive.
    """
    if user_id == current.id:
        raise PermissionDenied("You cannot deactivate your own account")

    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError("User not found")

    _guard_last_admin(db, user, new_role_code=None)

    user.is_active = False
    db.commit()


def _guard_last_admin(db: Session, user: User, *, new_role_code: str | None) -> None:
    """Refuse changes that would leave the system with no active admin."""
    if user.role.code != RoleCode.ADMIN.value:
        return
    if new_role_code == RoleCode.ADMIN.value:
        return

    remaining = db.scalar(
        select(func.count())
        .select_from(User)
        .join(Role, Role.id == User.role_id)
        .where(
            Role.code == RoleCode.ADMIN.value,
            User.is_active.is_(True),
            User.id != user.id,
        )
    ) or 0
    if remaining == 0:
        raise ConflictError(
            "This is the last active admin. Promote another user first."
        )


