"""Object-level authorization for a single report.

The role gate in `dependencies/auth.py` answers "may this KIND of user call this
endpoint". These answer "may THIS user touch THIS row" — which is the question
the brief actually poses ("a team member must never be able to access another
team member's report data"), and which role checks alone cannot answer.
"""
from __future__ import annotations

from fastapi import Depends, HTTPException, Path, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.dependencies.auth import get_current_user
from app.models import Report, User

_NOT_FOUND = HTTPException(
    status_code=status.HTTP_404_NOT_FOUND, detail="Report not found"
)


def get_report_for_read(
    report_id: int = Path(..., ge=1),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Report:
    """Load a report the caller is allowed to see.

    Returns 404 rather than 403 when a member addresses someone else's report:
    a 403 would confirm the record exists, letting anyone enumerate report ids
    and learn how many reports the team has. "Does not exist" and "not yours"
    are deliberately indistinguishable.
    """
    report = db.get(Report, report_id)
    if report is None:
        raise _NOT_FOUND
    if not user.is_manager and report.user_id != user.id:
        raise _NOT_FOUND
    return report


def get_report_for_write(
    report: Report = Depends(get_report_for_read),
    user: User = Depends(get_current_user),
) -> Report:
    """Load a report the caller may edit the *content* of.

    Ownership, not seniority, governs content. A manager — or an admin — editing
    a member's report is denied here, which is why there is no route through
    which the review flow could rewrite someone's words.
    """
    if report.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the report author can edit report content",
        )
    if not report.is_editable:
        # 409, not 400: the request is well-formed, the resource is in the
        # wrong state. The client's correct response is to refetch.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"This report is {report.status.value.replace('_', ' ').lower()} "
                "and can no longer be edited"
            ),
        )
    return report
