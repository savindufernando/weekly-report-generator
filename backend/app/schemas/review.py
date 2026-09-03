"""Review and version contracts."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import ReportStatus, ReviewAction
from app.schemas.user import UserBrief


class ReviewRequest(BaseModel):
    """The COMPLETE manager write surface.

    Note what is absent: there are no content fields. This is why a manager
    cannot rewrite a member's report — not because we validate against it, but
    because no route exists that could express it. `extra="forbid"` turns any
    attempt to smuggle one in into a 422 rather than silently ignoring it.
    """

    model_config = ConfigDict(extra="forbid")

    action: ReviewAction
    comment: str | None = Field(None, max_length=2000)

    @model_validator(mode="after")
    def comment_required_when_requesting_changes(self):
        # The brief: request changes "by leaving one general comment explaining
        # what needs correction". A blank comment leaves the author guessing.
        if self.action is ReviewAction.REQUEST_CHANGES and not (self.comment or "").strip():
            raise ValueError(
                "A comment explaining what needs correction is required"
            )
        return self


class ReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    action: ReviewAction
    comment: str | None
    against_version: int
    previous_status: ReportStatus
    new_status: ReportStatus
    reviewer: UserBrief
    created_at: datetime


class ReviewResponse(BaseModel):
    report_id: int
    status: ReportStatus
    review: ReviewOut


class VersionSummary(BaseModel):
    """A row in the version timeline.

    `review` carries the action taken against *this* version — which is the
    requirement that a reader can tell which version a comment was made against.
    """

    version_no: int
    submitted_at: datetime
    submitted_by: UserBrief
    is_current: bool
    content_hash: str
    review: ReviewOut | None = None


class VersionDetail(VersionSummary):
    content: dict


class SubmitResponse(BaseModel):
    id: int
    status: ReportStatus
    current_version_no: int
    submission_count: int
    last_submitted_at: datetime | None
    #: Non-fatal notices, e.g. "no_changes_detected".
    warnings: list[str] = Field(default_factory=list)
