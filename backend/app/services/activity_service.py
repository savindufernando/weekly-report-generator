"""Audit trail.

Written by the service layer only — never from a client payload.
"""
from __future__ import annotations

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models import ActivityLog, User


class ActivityService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def log(
        self,
        actor: User | None,
        entity_type: str,
        entity_id: int,
        action: str,
        meta: dict | None = None,
    ) -> ActivityLog:
        """Record an event. Flushes only — the caller's transaction commits, so
        an activity row can never outlive the change it describes."""
        row = ActivityLog(
            actor_id=actor.id if actor else None,
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            meta=meta or {},
        )
        self.db.add(row)
        self.db.flush()
        return row

    def recent(self, limit: int = 20, offset: int = 0) -> tuple[list[ActivityLog], int]:
        from sqlalchemy import func

        total = self.db.scalar(select(func.count()).select_from(ActivityLog)) or 0
        rows = self.db.scalars(
            select(ActivityLog)
            .order_by(desc(ActivityLog.created_at), desc(ActivityLog.id))
            .limit(limit)
            .offset(offset)
        ).all()
        return list(rows), total
