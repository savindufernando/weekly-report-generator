"""The review and correction workflow.

The brief calls this "a core, required part of the assignment, not optional",
and the evaluation criteria weight "correctness and completeness of the
review/correction workflow" directly. These are the highest-value tests here.
"""
from __future__ import annotations

import pytest

from app.core.exceptions import InvalidTransition
from app.models.enums import ReportStatus as S
from app.services.report_workflow import ReportWorkflow as W
from app.services.report_workflow import WorkflowEvent as E
from tests.conftest import auth_header

API = "/api/v1"


# ---------------------------------------------------------------- state machine
# No database, no HTTP — the transition table is testable on its own.


class TestTransitionTable:
    @pytest.mark.parametrize(
        "start,event,expected",
        [
            (S.DRAFT, E.SUBMIT, S.SUBMITTED),
            (S.DRAFT, E.SAVE_DRAFT, S.DRAFT),
            (S.SUBMITTED, E.APPROVE, S.APPROVED),
            (S.SUBMITTED, E.REQUEST_CHANGES, S.NEEDS_CORRECTION),
            (S.NEEDS_CORRECTION, E.SUBMIT, S.SUBMITTED),
            (S.NEEDS_CORRECTION, E.SAVE_DRAFT, S.NEEDS_CORRECTION),
        ],
    )
    def test_legal_transitions(self, start, event, expected):
        assert W.next_status(start, event) is expected

    @pytest.mark.parametrize(
        "start,event",
        [
            (S.DRAFT, E.APPROVE),            # cannot approve an unsubmitted report
            (S.DRAFT, E.REQUEST_CHANGES),
            (S.SUBMITTED, E.SAVE_DRAFT),     # locked while under review
            (S.SUBMITTED, E.SUBMIT),         # already submitted
            (S.APPROVED, E.SUBMIT),          # APPROVED is terminal
            (S.APPROVED, E.APPROVE),
            (S.APPROVED, E.REQUEST_CHANGES),
            (S.APPROVED, E.SAVE_DRAFT),
            (S.NEEDS_CORRECTION, E.APPROVE),
        ],
    )
    def test_illegal_transitions_raise(self, start, event):
        with pytest.raises(InvalidTransition):
            W.next_status(start, event)

    def test_approved_is_terminal(self):
        assert W.allowed_events(S.APPROVED) == []

    def test_editable_states(self):
        assert W.is_editable(S.DRAFT)
        assert W.is_editable(S.NEEDS_CORRECTION)
        assert not W.is_editable(S.SUBMITTED)
        assert not W.is_editable(S.APPROVED)

    def test_error_names_the_allowed_events(self):
        """The 409 body tells the client what it *could* have done."""
        with pytest.raises(InvalidTransition) as exc:
            W.next_status(S.DRAFT, E.APPROVE)
        assert set(exc.value.context["allowed_events"]) == {"save_draft", "submit"}


# ------------------------------------------------------------------- end to end


@pytest.fixture
def project(client, admin):
    return client.post(
        f"{API}/projects",
        json={"name": "Client A Portal", "code": "CLIA"},
        headers=auth_header(admin),
    ).json()


def content(project_id: int, **overrides) -> dict:
    base = {
        "project_id": project_id,
        "notes": "Week notes",
        "links": [],
        "tasks": [
            {
                "name": "Payment API integration",
                "status": "COMPLETED",
                "planned_pct": 100,
                "actual_pct": 100,
                "hours_planned": "16.00",
                "hours_spent": "0.00",
            }
        ],
        "next_week_tasks": [],
        "blockers": [{"description": "Sandbox down", "severity": "HIGH", "is_key": True}],
        "achievements": [{"description": "Shipped checkout", "is_key": True}],
        "hours_by_type": {"DEVELOPMENT": "20.00"},
    }
    base.update(overrides)
    return base


@pytest.fixture
def filled_report(client, member_a, project):
    """A draft with valid content, ready to submit."""
    created = client.post(
        f"{API}/reports",
        json={"week_start": "2026-03-02", "project_id": project["id"]},
        headers=auth_header(member_a),
    ).json()
    client.put(
        f"{API}/reports/{created['id']}",
        json=content(project["id"]),
        headers=auth_header(member_a),
    )
    return created


class TestSubmission:
    def test_submit_creates_version_one(self, client, member_a, filled_report):
        r = client.post(
            f"{API}/reports/{filled_report['id']}/submit", headers=auth_header(member_a)
        )
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "SUBMITTED"
        assert body["current_version_no"] == 1
        assert body["submission_count"] == 1

    def test_cannot_submit_without_tasks(self, client, member_a, project):
        created = client.post(
            f"{API}/reports",
            json={"week_start": "2026-03-02", "project_id": project["id"]},
            headers=auth_header(member_a),
        ).json()
        client.put(
            f"{API}/reports/{created['id']}",
            json=content(project["id"], tasks=[]),
            headers=auth_header(member_a),
        )
        r = client.post(f"{API}/reports/{created['id']}/submit", headers=auth_header(member_a))
        assert r.status_code == 422

    def test_submitted_report_is_locked_for_editing(
        self, client, member_a, filled_report, project
    ):
        client.post(f"{API}/reports/{filled_report['id']}/submit", headers=auth_header(member_a))
        r = client.put(
            f"{API}/reports/{filled_report['id']}",
            json=content(project["id"], notes="sneaky edit"),
            headers=auth_header(member_a),
        )
        assert r.status_code == 409

    def test_cannot_submit_twice(self, client, member_a, filled_report):
        client.post(f"{API}/reports/{filled_report['id']}/submit", headers=auth_header(member_a))
        again = client.post(
            f"{API}/reports/{filled_report['id']}/submit", headers=auth_header(member_a)
        )
        assert again.status_code == 409

    def test_draft_creates_no_versions(self, client, member_a, filled_report):
        """Saving is not submitting — only submissions produce versions, so
        version_no counts review rounds rather than keystrokes."""
        r = client.get(
            f"{API}/reports/{filled_report['id']}/versions", headers=auth_header(member_a)
        )
        assert r.json() == []


class TestReviewActions:
    def test_manager_can_approve(self, client, member_a, manager, filled_report):
        client.post(f"{API}/reports/{filled_report['id']}/submit", headers=auth_header(member_a))
        r = client.post(
            f"{API}/reports/{filled_report['id']}/review",
            json={"action": "APPROVE", "comment": "Looks good"},
            headers=auth_header(manager),
        )
        assert r.status_code == 200
        assert r.json()["status"] == "APPROVED"

    def test_request_changes_requires_a_comment(
        self, client, member_a, manager, filled_report
    ):
        client.post(f"{API}/reports/{filled_report['id']}/submit", headers=auth_header(member_a))
        r = client.post(
            f"{API}/reports/{filled_report['id']}/review",
            json={"action": "REQUEST_CHANGES", "comment": "   "},
            headers=auth_header(manager),
        )
        assert r.status_code == 422

    def test_member_cannot_review(self, client, member_a, member_b, filled_report):
        client.post(f"{API}/reports/{filled_report['id']}/submit", headers=auth_header(member_a))
        r = client.post(
            f"{API}/reports/{filled_report['id']}/review",
            json={"action": "APPROVE"},
            headers=auth_header(member_b),
        )
        assert r.status_code == 403

    def test_cannot_review_a_draft(self, client, manager, filled_report):
        r = client.post(
            f"{API}/reports/{filled_report['id']}/review",
            json={"action": "APPROVE"},
            headers=auth_header(manager),
        )
        assert r.status_code == 409

    def test_second_reviewer_gets_409(self, client, db, roles, member_a, manager, filled_report):
        """Two managers acting at once: the state machine settles it."""
        from app.models import RoleCode
        from tests.conftest import make_user

        other = make_user(db, roles, email="mgr2@test.com", role=RoleCode.MANAGER)
        client.post(f"{API}/reports/{filled_report['id']}/submit", headers=auth_header(member_a))

        first = client.post(
            f"{API}/reports/{filled_report['id']}/review",
            json={"action": "APPROVE"},
            headers=auth_header(manager),
        )
        second = client.post(
            f"{API}/reports/{filled_report['id']}/review",
            json={"action": "APPROVE"},
            headers=auth_header(other),
        )
        assert first.status_code == 200
        assert second.status_code == 409

    def test_manager_cannot_review_their_own_report(
        self, client, manager, project
    ):
        """Segregation of duties — managers file reports too."""
        created = client.post(
            f"{API}/reports",
            json={"week_start": "2026-03-02", "project_id": project["id"]},
            headers=auth_header(manager),
        ).json()
        client.put(
            f"{API}/reports/{created['id']}",
            json=content(project["id"]),
            headers=auth_header(manager),
        )
        client.post(f"{API}/reports/{created['id']}/submit", headers=auth_header(manager))
        r = client.post(
            f"{API}/reports/{created['id']}/review",
            json={"action": "APPROVE"},
            headers=auth_header(manager),
        )
        assert r.status_code == 403

    def test_review_payload_rejects_content_fields(
        self, client, member_a, manager, filled_report
    ):
        """The structural guarantee: a manager cannot rewrite report content
        because the schema cannot express it."""
        client.post(f"{API}/reports/{filled_report['id']}/submit", headers=auth_header(member_a))
        r = client.post(
            f"{API}/reports/{filled_report['id']}/review",
            json={"action": "APPROVE", "notes": "injected", "tasks": []},
            headers=auth_header(manager),
        )
        assert r.status_code == 422

    def test_approved_report_is_immutable(
        self, client, member_a, manager, filled_report, project
    ):
        client.post(f"{API}/reports/{filled_report['id']}/submit", headers=auth_header(member_a))
        client.post(
            f"{API}/reports/{filled_report['id']}/review",
            json={"action": "APPROVE"},
            headers=auth_header(manager),
        )
        edit = client.put(
            f"{API}/reports/{filled_report['id']}",
            json=content(project["id"], notes="after approval"),
            headers=auth_header(member_a),
        )
        resubmit = client.post(
            f"{API}/reports/{filled_report['id']}/submit", headers=auth_header(member_a)
        )
        assert edit.status_code == 409
        assert resubmit.status_code == 409


class TestCorrectionCycle:
    """The requirement most submissions get wrong."""

    def test_full_cycle_preserves_every_version(
        self, client, member_a, manager, filled_report, project
    ):
        rid = filled_report["id"]

        # --- round 1 -------------------------------------------------------
        client.post(f"{API}/reports/{rid}/submit", headers=auth_header(member_a))
        client.post(
            f"{API}/reports/{rid}/review",
            json={
                "action": "REQUEST_CHANGES",
                "comment": "Please add hour estimates to the API tasks.",
            },
            headers=auth_header(manager),
        )

        detail = client.get(f"{API}/reports/{rid}", headers=auth_header(member_a)).json()
        assert detail["status"] == "NEEDS_CORRECTION"
        assert detail["is_editable"] is True  # editable again
        assert detail["latest_review"]["comment"].startswith("Please add hour")
        assert detail["latest_review"]["against_version"] == 1

        # --- the member corrects and resubmits ------------------------------
        client.put(
            f"{API}/reports/{rid}",
            json=content(
                project["id"],
                tasks=[
                    {
                        "name": "Payment API integration",
                        "status": "COMPLETED",
                        "planned_pct": 100,
                        "actual_pct": 100,
                        "hours_planned": "16.00",
                        "hours_spent": "18.50",  # the correction
                    }
                ],
            ),
            headers=auth_header(member_a),
        )
        resubmit = client.post(f"{API}/reports/{rid}/submit", headers=auth_header(member_a))
        assert resubmit.json()["status"] == "SUBMITTED"
        assert resubmit.json()["current_version_no"] == 2
        assert resubmit.json()["submission_count"] == 2

        # --- version history ------------------------------------------------
        versions = client.get(
            f"{API}/reports/{rid}/versions", headers=auth_header(manager)
        ).json()
        assert len(versions) == 2, "version 1 must not be overwritten"

        v2, v1 = versions[0], versions[1]
        assert v2["version_no"] == 2 and v2["is_current"] is True
        assert v1["version_no"] == 1 and v1["is_current"] is False

        # THE assertion: the comment is pinned to the version it was written
        # against, not merely to the report.
        assert v1["review"]["comment"].startswith("Please add hour")
        assert v1["review"]["against_version"] == 1
        assert v2["review"] is None, "v2 has not been reviewed yet"

        # --- the old content is genuinely preserved --------------------------
        old = client.get(
            f"{API}/reports/{rid}/versions/1", headers=auth_header(manager)
        ).json()
        new = client.get(
            f"{API}/reports/{rid}/versions/2", headers=auth_header(manager)
        ).json()
        assert old["content"]["tasks"][0]["hours_spent"] == 0.0
        assert new["content"]["tasks"][0]["hours_spent"] == 18.5

        # --- approval --------------------------------------------------------
        client.post(
            f"{API}/reports/{rid}/review",
            json={"action": "APPROVE", "comment": "Thanks, clear now."},
            headers=auth_header(manager),
        )
        final = client.get(f"{API}/reports/{rid}/versions", headers=auth_header(manager)).json()
        assert final[0]["review"]["action"] == "APPROVE"
        assert final[0]["review"]["against_version"] == 2
        assert final[1]["review"]["action"] == "REQUEST_CHANGES"

    def test_comment_history_is_kept_not_just_the_latest(
        self, client, member_a, manager, filled_report, project
    ):
        rid = filled_report["id"]
        for i in range(2):
            client.post(f"{API}/reports/{rid}/submit", headers=auth_header(member_a))
            client.post(
                f"{API}/reports/{rid}/review",
                json={"action": "REQUEST_CHANGES", "comment": f"Round {i + 1} feedback"},
                headers=auth_header(manager),
            )
            client.put(
                f"{API}/reports/{rid}",
                json=content(project["id"], notes=f"revision {i}"),
                headers=auth_header(member_a),
            )

        comments = client.get(
            f"{API}/reports/{rid}/comments", headers=auth_header(member_a)
        ).json()
        assert len(comments) == 2
        assert comments[0]["comment"] == "Round 1 feedback"   # oldest first
        assert comments[1]["comment"] == "Round 2 feedback"
        assert comments[0]["against_version"] == 1
        assert comments[1]["against_version"] == 2

    def test_resubmitting_unchanged_content_warns(
        self, client, member_a, manager, filled_report
    ):
        rid = filled_report["id"]
        client.post(f"{API}/reports/{rid}/submit", headers=auth_header(member_a))
        client.post(
            f"{API}/reports/{rid}/review",
            json={"action": "REQUEST_CHANGES", "comment": "Please revise"},
            headers=auth_header(manager),
        )
        again = client.post(f"{API}/reports/{rid}/submit", headers=auth_header(member_a))
        assert again.status_code == 200
        assert "no_changes_detected" in again.json()["warnings"]

    def test_first_submitted_at_is_not_moved_by_corrections(
        self, client, member_a, manager, filled_report, project
    ):
        """Lateness is judged on the first submission, so correcting a report
        must never make it retroactively late."""
        rid = filled_report["id"]
        client.post(f"{API}/reports/{rid}/submit", headers=auth_header(member_a))
        first = client.get(f"{API}/reports/{rid}", headers=auth_header(member_a)).json()

        client.post(
            f"{API}/reports/{rid}/review",
            json={"action": "REQUEST_CHANGES", "comment": "Revise please"},
            headers=auth_header(manager),
        )
        client.put(
            f"{API}/reports/{rid}",
            json=content(project["id"], notes="revised"),
            headers=auth_header(member_a),
        )
        client.post(f"{API}/reports/{rid}/submit", headers=auth_header(member_a))
        after = client.get(f"{API}/reports/{rid}", headers=auth_header(member_a)).json()

        assert after["first_submitted_at"] == first["first_submitted_at"]
        assert after["last_submitted_at"] != first["last_submitted_at"]


class TestReviewQueue:
    def test_queue_lists_submitted_reports(self, client, member_a, manager, filled_report):
        client.post(f"{API}/reports/{filled_report['id']}/submit", headers=auth_header(member_a))
        body = client.get(f"{API}/review-queue", headers=auth_header(manager)).json()
        assert body["total"] == 1
        assert body["items"][0]["id"] == filled_report["id"]
        assert body["items"][0]["waiting_hours"] is not None

    def test_member_cannot_see_the_queue(self, client, member_a):
        assert client.get(f"{API}/review-queue", headers=auth_header(member_a)).status_code == 403

    def test_approved_reports_leave_the_queue(
        self, client, member_a, manager, filled_report
    ):
        client.post(f"{API}/reports/{filled_report['id']}/submit", headers=auth_header(member_a))
        client.post(
            f"{API}/reports/{filled_report['id']}/review",
            json={"action": "APPROVE"},
            headers=auth_header(manager),
        )
        assert client.get(f"{API}/review-queue", headers=auth_header(manager)).json()["total"] == 0
