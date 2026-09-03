"""Project routes."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError
from app.database.session import get_db
from app.dependencies.auth import get_current_user, require_permission
from app.models import Project, ProjectMember, Report, User
from app.schemas.project import ProjectCreate, ProjectOut, ProjectUpdate

router = APIRouter(prefix="/projects", tags=["projects"])


def _to_out(db: Session, project: Project) -> ProjectOut:
    report_count = db.scalar(
        select(func.count()).select_from(Report).where(Report.project_id == project.id)
    ) or 0
    member_count = db.scalar(
        select(func.count())
        .select_from(ProjectMember)
        .where(ProjectMember.project_id == project.id)
    ) or 0
    return ProjectOut(
        id=project.id,
        name=project.name,
        code=project.code,
        color=project.color,
        description=project.description,
        is_archived=project.is_archived,
        report_count=report_count,
        member_count=member_count,
    )


@router.get("", response_model=list[ProjectOut], summary="List projects")
def list_projects(
    include_archived: bool = Query(False),
    db: Session = Depends(get_db),
    # Readable by everyone: members need the list to tag a report.
    _: User = Depends(get_current_user),
) -> list[ProjectOut]:
    stmt = select(Project).order_by(Project.name)
    if not include_archived:
        stmt = stmt.where(Project.is_archived.is_(False))
    return [_to_out(db, p) for p in db.scalars(stmt)]


@router.post(
    "",
    response_model=ProjectOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("project.manage"))],
    summary="Create a project",
)
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProjectOut:
    project = Project(**payload.model_dump(), created_by=user.id)
    db.add(project)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ConflictError("A project with that name or code already exists") from None
    db.refresh(project)
    return _to_out(db, project)


@router.patch(
    "/{project_id}",
    response_model=ProjectOut,
    dependencies=[Depends(require_permission("project.manage"))],
    summary="Update a project",
)
def update_project(
    project_id: int, payload: ProjectUpdate, db: Session = Depends(get_db)
) -> ProjectOut:
    project = db.get(Project, project_id)
    if project is None:
        raise NotFoundError("Project not found")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, key, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ConflictError("A project with that name already exists") from None
    db.refresh(project)
    return _to_out(db, project)


@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    response_class=Response,
    dependencies=[Depends(require_permission("project.manage"))],
    summary="Delete a project (archives it when referenced)",
)
def delete_project(
    project_id: int, response: Response, db: Session = Depends(get_db)
) -> None:
    """Archives rather than deletes when reports reference the project.

    Hard-deleting a referenced project would either destroy history or fail the
    foreign key, so "delete" means archive here. The X-Delete-Mode header tells
    the client which actually happened so the UI can say so honestly.
    """
    project = db.get(Project, project_id)
    if project is None:
        raise NotFoundError("Project not found")

    in_use = db.scalar(
        select(func.count()).select_from(Report).where(Report.project_id == project_id)
    ) or 0

    if in_use:
        project.is_archived = True
        response.headers["X-Delete-Mode"] = "archived"
    else:
        db.delete(project)
        response.headers["X-Delete-Mode"] = "deleted"
    db.commit()
