"""Generate a Mermaid ER diagram by introspecting the live database.

    python -m app.seeds.erd > ../docs/erd.mmd

Generated from the real schema rather than hand-drawn, so the diagram cannot
drift from the tables it documents — which matters, because a submitted ER
diagram that disagrees with the code is worse than none.
"""
from __future__ import annotations

import sys

from sqlalchemy import inspect

from app.database.base import Base  # noqa: F401  (registers every model)
from app.database.session import engine

#: Columns worth showing. A full dump is unreadable; these are the ones that
#: carry the design — keys, the workflow, and the version/comment linkage.
HIGHLIGHT = {
    "users": ["id", "email", "full_name", "role_id", "manager_id", "is_active"],
    "roles": ["id", "code", "name"],
    "permissions": ["id", "code"],
    "role_permissions": ["role_id", "permission_id"],
    "refresh_tokens": ["id", "user_id", "token_hash", "expires_at", "revoked_at"],
    "projects": ["id", "name", "code", "color", "is_archived"],
    "project_members": ["project_id", "user_id"],
    "reports": [
        "id", "user_id", "project_id", "week_start", "week_end", "status",
        "current_version_no", "submission_count", "first_submitted_at",
    ],
    "report_tasks": [
        "id", "report_id", "project_id", "name", "priority", "status",
        "planned_pct", "actual_pct", "hours_planned", "hours_spent",
    ],
    "report_next_week_tasks": ["id", "report_id", "description", "priority"],
    "report_blockers": ["id", "report_id", "description", "severity", "is_key", "is_resolved"],
    "report_achievements": ["id", "report_id", "description", "is_key"],
    "report_hours": ["id", "report_id", "task_type", "hours"],
    "report_versions": [
        "id", "report_id", "version_no", "content", "content_hash", "submitted_at",
    ],
    "review_history": [
        "id", "report_id", "report_version_id", "reviewer_id", "action",
        "comment", "previous_status", "new_status",
    ],
    "activity_logs": ["id", "actor_id", "entity_type", "entity_id", "action"],
}

NOTES = {
    "reports": "one per (user, week)",
    "report_versions": "immutable snapshot per submit",
    "review_history": "comment points at a VERSION",
    "report_blockers": "<=1 key per report",
    "report_achievements": "<=1 key per report",
}


def _mermaid_type(sql_type: str) -> str:
    """Mermaid ER attribute types cannot contain punctuation."""
    base = sql_type.split("(")[0].strip().lower()
    return {
        "bigint": "bigint", "smallint": "smallint", "tinyint": "tinyint",
        "int": "int", "integer": "int", "varchar": "varchar", "char": "char",
        "text": "text", "longtext": "json", "json": "json", "date": "date",
        "datetime": "datetime", "timestamp": "datetime", "decimal": "decimal",
        "numeric": "decimal", "enum": "enum", "bool": "bool", "boolean": "bool",
    }.get(base, base or "unknown")


def generate() -> str:
    inspector = inspect(engine)
    tables = [t for t in inspector.get_table_names() if t != "alembic_version"]

    lines: list[str] = ["erDiagram"]
    relationships: list[str] = []

    for table in sorted(tables):
        fks = inspector.get_foreign_keys(table)
        for fk in fks:
            target = fk["referred_table"]
            column = (fk["constrained_columns"] or ["?"])[0]
            # Every FK here is a to-many from the parent's side.
            relationships.append(f'    {target.upper()} ||--o{{ {table.upper()} : "{column}"')

    lines.extend(sorted(set(relationships)))
    lines.append("")

    for table in sorted(tables):
        columns = {c["name"]: c for c in inspector.get_columns(table)}
        pk = set(inspector.get_pk_constraint(table).get("constrained_columns") or [])
        fk_cols = {
            c for fk in inspector.get_foreign_keys(table)
            for c in (fk["constrained_columns"] or [])
        }
        uniques = {
            c for uc in inspector.get_indexes(table) if uc.get("unique")
            for c in (uc.get("column_names") or []) if c
        }

        wanted = HIGHLIGHT.get(table, list(columns)[:8])
        lines.append(f"    {table.upper()} {{")
        for name in wanted:
            column = columns.get(name)
            if column is None:
                continue
            marks = []
            if name in pk:
                marks.append("PK")
            if name in fk_cols:
                marks.append("FK")
            if name in uniques and name not in pk:
                marks.append("UK")
            suffix = f' "{",".join(marks)}"' if marks else ""
            lines.append(f"        {_mermaid_type(str(column['type']))} {name}{suffix}")

        if table in NOTES:
            lines.append(f'        string _{"_"} "{NOTES[table]}"')
        lines.append("    }")

    return "\n".join(lines)


if __name__ == "__main__":  # pragma: no cover
    sys.stdout.write(generate() + "\n")
