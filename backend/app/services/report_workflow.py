"""The report status machine.

The entire workflow is one transition table rather than `if status ==` checks
scattered across services and routers. That makes it exhaustively testable
without a database, and makes adding a transition (a "withdraw submission"
action, say) a one-line change.

    DRAFT ──submit──> SUBMITTED ──approve──> APPROVED
                          │
                          └──request_changes──> NEEDS_CORRECTION ──submit──> SUBMITTED

APPROVED is terminal: it appears as no key in the table, so every event from it
is rejected.
"""
from __future__ import annotations

import enum

from app.core.exceptions import InvalidTransition
from app.models.enums import ReportStatus as S


class WorkflowEvent(str, enum.Enum):
    SAVE_DRAFT = "save_draft"
    SUBMIT = "submit"
    APPROVE = "approve"
    REQUEST_CHANGES = "request_changes"


class ReportWorkflow:
    #: (current status, event) -> resulting status. Absent pair = illegal.
    TRANSITIONS: dict[tuple[S, WorkflowEvent], S] = {
        (S.DRAFT, WorkflowEvent.SAVE_DRAFT): S.DRAFT,
        (S.DRAFT, WorkflowEvent.SUBMIT): S.SUBMITTED,
        (S.SUBMITTED, WorkflowEvent.APPROVE): S.APPROVED,
        (S.SUBMITTED, WorkflowEvent.REQUEST_CHANGES): S.NEEDS_CORRECTION,
        (S.NEEDS_CORRECTION, WorkflowEvent.SAVE_DRAFT): S.NEEDS_CORRECTION,
        (S.NEEDS_CORRECTION, WorkflowEvent.SUBMIT): S.SUBMITTED,
    }

    #: Content may only be modified in these states.
    EDITABLE_STATES = frozenset({S.DRAFT, S.NEEDS_CORRECTION})
    #: A manager may only act on a report in these states.
    REVIEWABLE_STATES = frozenset({S.SUBMITTED})

    @classmethod
    def next_status(cls, current: S, event: WorkflowEvent) -> S:
        try:
            return cls.TRANSITIONS[(current, event)]
        except KeyError:
            raise InvalidTransition(
                f"Cannot {event.value.replace('_', ' ')} a report that is "
                f"{current.value.replace('_', ' ').lower()}",
                current_status=current.value,
                event=event.value,
                allowed_events=cls.allowed_events(current),
            ) from None

    @classmethod
    def assert_can(cls, current: S, event: WorkflowEvent) -> None:
        cls.next_status(current, event)

    @classmethod
    def allowed_events(cls, current: S) -> list[str]:
        return sorted(e.value for (s, e) in cls.TRANSITIONS if s is current)

    @classmethod
    def is_editable(cls, status: S) -> bool:
        return status in cls.EDITABLE_STATES

    @classmethod
    def is_reviewable(cls, status: S) -> bool:
        return status in cls.REVIEWABLE_STATES
