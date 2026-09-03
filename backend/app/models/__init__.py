"""All ORM models.

Every model is imported here so that importing *any* model registers the whole
mapper registry. Without this, a module that imports only ``User`` fails at
query time with "expression 'Report.user_id' failed to locate a name", because
string-based relationship targets can only resolve against classes the registry
has actually seen.
"""
from app.models.base import Base
from app.models.enums import (
    BlockerSeverity,
    Permission,
    ROLE_PERMISSIONS,
    ReportStatus,
    ReviewAction,
    RoleCode,
    TaskPriority,
    TaskStatus,
    TaskType,
)
from app.models.project import Project, ProjectMember
from app.models.report import (
    Achievement,
    Blocker,
    NextWeekTask,
    Report,
    ReportHours,
    ReportTask,
)
from app.models.review import ActivityLog, ReviewHistory
from app.models.user import PermissionModel, RefreshToken, Role, RolePermission, User
from app.models.version import ReportVersion

__all__ = [
    "Base",
    "BlockerSeverity",
    "Permission",
    "ROLE_PERMISSIONS",
    "ReportStatus",
    "ReviewAction",
    "RoleCode",
    "TaskPriority",
    "TaskStatus",
    "TaskType",
    "Project",
    "ProjectMember",
    "Achievement",
    "Blocker",
    "NextWeekTask",
    "Report",
    "ReportHours",
    "ReportTask",
    "ActivityLog",
    "ReviewHistory",
    "PermissionModel",
    "RefreshToken",
    "Role",
    "RolePermission",
    "User",
    "ReportVersion",
]
