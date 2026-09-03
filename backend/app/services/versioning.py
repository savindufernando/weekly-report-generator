"""Immutable report snapshots.

Written once per submission, never updated or deleted. This is what satisfies
the requirement that "the previous version of that report's content must remain
visible, not just overwritten".
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime

from sqlalchemy.orm import Session

from app.models import Report, ReportVersion, User

#: Bumped if the snapshot shape ever changes, so old versions stay readable.
SNAPSHOT_SCHEMA_VERSION = 1


class VersionService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def build_content(self, report: Report) -> dict:
        """A complete, self-contained representation of the report right now.

        Names are denormalised into the snapshot on purpose. If a project is
        renamed in June, March's version 1 must still read as it did in March —
        a snapshot holding only project_id would silently rewrite history.
        """
        return {
            "schema_version": SNAPSHOT_SCHEMA_VERSION,
            "week_start": report.week_start.isoformat(),
            "week_end": report.week_end.isoformat() if report.week_end else None,
            "project": {
                "id": report.project_id,
                "name": report.project.name,
                "code": report.project.code,
            },
            "notes": report.notes,
            "links": report.links or [],
            "tasks": [
                {
                    "name": t.name,
                    "priority": t.priority.value,
                    "status": t.status.value,
                    "planned_pct": t.planned_pct,
                    "actual_pct": t.actual_pct,
                    "hours_planned": float(t.hours_planned),
                    "hours_spent": float(t.hours_spent),
                    "deliverable": t.deliverable,
                }
                for t in sorted(report.tasks, key=lambda x: x.order_index)
            ],
            "next_week_tasks": [
                {"description": n.description, "priority": n.priority.value}
                for n in sorted(report.next_week_tasks, key=lambda x: x.order_index)
            ],
            "blockers": [
                {
                    "description": b.description,
                    "severity": b.severity.value,
                    "is_key": b.is_key,
                    "is_resolved": b.is_resolved,
                }
                for b in sorted(report.blockers, key=lambda x: x.order_index)
            ],
            "achievements": [
                {"description": a.description, "is_key": a.is_key}
                for a in sorted(report.achievements, key=lambda x: x.order_index)
            ],
            "hours_by_type": {
                h.task_type.value: float(h.hours) for h in report.hours
            },
        }

    @staticmethod
    def content_hash(content: dict) -> str:
        # sort_keys makes the hash stable regardless of dict ordering, so it
        # genuinely reflects content rather than serialisation accidents.
        payload = json.dumps(content, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def create_snapshot(
        self, report: Report, actor: User, *, submitted_at: datetime
    ) -> ReportVersion:
        """Freeze the report's current content as the next version.

        Flushes rather than commits: the caller needs the generated id to link a
        review comment, and the whole submit must land in one transaction.
        """
        content = self.build_content(report)
        version = ReportVersion(
            report_id=report.id,
            version_no=report.current_version_no + 1,
            content=content,
            content_hash=self.content_hash(content),
            submitted_at=submitted_at,
            submitted_by=actor.id,
        )
        self.db.add(version)
        self.db.flush()
        return version

    def latest(self, report: Report) -> ReportVersion | None:
        return report.versions[0] if report.versions else None

    def is_unchanged_since_last(self, report: Report) -> bool:
        """True when resubmitting would produce a byte-identical version.

        Costs one hash and lets us tell the user they resubmitted without
        actually changing anything, instead of silently storing a duplicate.
        """
        latest = self.latest(report)
        if latest is None:
            return False
        return latest.content_hash == self.content_hash(self.build_content(report))
