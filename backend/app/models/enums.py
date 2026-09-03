"""Domain enumerations.

Member names and values are kept identical so the stored value is readable in
the database and unambiguous in the API.
"""
from __future__ import annotations

import enum


class ReportStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    NEEDS_CORRECTION = "NEEDS_CORRECTION"
    APPROVED = "APPROVED"


class ReviewAction(str, enum.Enum):
    APPROVE = "APPROVE"
    REQUEST_CHANGES = "REQUEST_CHANGES"


class TaskPriority(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class TaskStatus(str, enum.Enum):
    NOT_STARTED = "NOT_STARTED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    BLOCKED = "BLOCKED"
    DEFERRED = "DEFERRED"


class TaskType(str, enum.Enum):
    """Buckets for the hours-worked breakdown."""

    DEVELOPMENT = "DEVELOPMENT"
    TESTING = "TESTING"
    MEETINGS = "MEETINGS"
    DOCUMENTATION = "DOCUMENTATION"
    REVIEW = "REVIEW"
    OTHER = "OTHER"


class BlockerSeverity(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class RoleCode(str, enum.Enum):
    MEMBER = "MEMBER"
    MANAGER = "MANAGER"
    ADMIN = "ADMIN"


class Permission(str, enum.Enum):
    """Capability codes. Endpoints depend on these, never on a role name, so
    adding a role is data rather than a code change."""

    REPORT_CREATE_OWN = "report.create_own"
    REPORT_EDIT_OWN = "report.edit_own"
    REPORT_SUBMIT_OWN = "report.submit_own"
    REPORT_VIEW_OWN = "report.view_own"
    REPORT_VIEW_ALL = "report.view_all"
    REPORT_REVIEW = "report.review"
    PROJECT_MANAGE = "project.manage"
    USER_VIEW_ALL = "user.view_all"
    USER_MANAGE_ROLES = "user.manage_roles"
    DASHBOARD_VIEW = "dashboard.view"
    AI_QUERY = "ai.query"


#: Which permissions each role is granted. Seeded into role_permissions.
ROLE_PERMISSIONS: dict[RoleCode, set[Permission]] = {
    RoleCode.MEMBER: {
        Permission.REPORT_CREATE_OWN,
        Permission.REPORT_EDIT_OWN,
        Permission.REPORT_SUBMIT_OWN,
        Permission.REPORT_VIEW_OWN,
    },
    RoleCode.MANAGER: {
        Permission.REPORT_CREATE_OWN,
        Permission.REPORT_EDIT_OWN,
        Permission.REPORT_SUBMIT_OWN,
        Permission.REPORT_VIEW_OWN,
        Permission.REPORT_VIEW_ALL,
        Permission.REPORT_REVIEW,
        Permission.PROJECT_MANAGE,
        Permission.USER_VIEW_ALL,
        Permission.DASHBOARD_VIEW,
        Permission.AI_QUERY,
    },
    # Admin is not "manager plus a flag" — it is a distinct role whose
    # permission set happens to be a superset.
    RoleCode.ADMIN: set(Permission),
}
