"""Roles and permissions reference data.

Idempotent: safe to run on every deploy. Called by the seed script and by the
test fixtures, so both get the identical permission model.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import ROLE_PERMISSIONS, Permission, RoleCode
from app.models import PermissionModel, Role, RolePermission

ROLE_DESCRIPTIONS: dict[RoleCode, tuple[str, str]] = {
    RoleCode.MEMBER: ("Team Member", "Creates, edits and submits their own weekly reports"),
    RoleCode.MANAGER: ("Manager", "Reviews team reports and views the team dashboard"),
    RoleCode.ADMIN: ("Admin", "Full access including user and role management"),
}

PERMISSION_DESCRIPTIONS: dict[Permission, str] = {
    Permission.REPORT_CREATE_OWN: "Create own weekly report",
    Permission.REPORT_EDIT_OWN: "Edit own report while it is editable",
    Permission.REPORT_SUBMIT_OWN: "Submit own report for review",
    Permission.REPORT_VIEW_OWN: "View own reports",
    Permission.REPORT_VIEW_ALL: "View every team member's reports",
    Permission.REPORT_REVIEW: "Approve or request changes on a report",
    Permission.PROJECT_MANAGE: "Create, edit and archive projects",
    Permission.USER_VIEW_ALL: "View the team member list and profiles",
    Permission.USER_MANAGE_ROLES: "Assign roles to users",
    Permission.DASHBOARD_VIEW: "View the team dashboard and analytics",
    Permission.AI_QUERY: "Use the AI assistant",
}


def seed_roles_and_permissions(db: Session) -> dict[str, Role]:
    """Create roles, permissions and their grants. Returns roles by code."""
    permissions: dict[str, PermissionModel] = {
        p.code: p for p in db.scalars(select(PermissionModel)).all()
    }
    for perm in Permission:
        if perm.value not in permissions:
            row = PermissionModel(
                code=perm.value, description=PERMISSION_DESCRIPTIONS[perm]
            )
            db.add(row)
            permissions[perm.value] = row
    db.flush()

    roles: dict[str, Role] = {r.code: r for r in db.scalars(select(Role)).all()}
    for code in RoleCode:
        if code.value not in roles:
            name, description = ROLE_DESCRIPTIONS[code]
            row = Role(code=code.value, name=name, description=description)
            db.add(row)
            roles[code.value] = row
    db.flush()

    existing = {
        (rp.role_id, rp.permission_id)
        for rp in db.scalars(select(RolePermission)).all()
    }
    for role_code, perms in ROLE_PERMISSIONS.items():
        role = roles[role_code.value]
        for perm in perms:
            pair = (role.id, permissions[perm.value].id)
            if pair not in existing:
                db.add(RolePermission(role_id=pair[0], permission_id=pair[1]))
                existing.add(pair)
    db.flush()
    return roles


if __name__ == "__main__":  # pragma: no cover
    from app.database.session import SessionLocal

    with SessionLocal() as session:
        result = seed_roles_and_permissions(session)
        session.commit()
        for code, role in result.items():
            print(f"{code:<8} -> {len(role.permissions)} permissions")
