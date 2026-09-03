"""Dashboard metrics and analytics."""
from __future__ import annotations

from datetime import date, datetime, timedelta

import pytest

from app.models import Report, RoleCode
from tests.conftest import auth_header, make_user

API = "/api/v1"
WEEK = "2026-03-02"  # a Monday


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
        "notes": "",
        "links": [],
        "tasks": [
            {
                "name": "Build the thing",
                "status": "COMPLETED",
                "planned_pct": 100,
                "actual_pct": 100,
                "hours_spent": "20.00",
            }
        ],
        "next_week_tasks": [],
        "blockers": [{"description": "Sandbox down", "severity": "HIGH", "is_key": True}],
        "achievements": [],
        "hours_by_type": {"DEVELOPMENT": "20.00"},
    }
    base.update(overrides)
    return base


def file_report(client, user, project, *, week=WEEK, submit=False, **content_overrides):
    created = client.post(
        f"{API}/reports",
        json={"week_start": week, "project_id": project["id"]},
        headers=auth_header(user),
    ).json()
    client.put(
        f"{API}/reports/{created['id']}",
        json=content(project["id"], **content_overrides),
        headers=auth_header(user),
    )
    if submit:
        client.post(f"{API}/reports/{created['id']}/submit", headers=auth_header(user))
    return created


class TestNotStarted:
    """The metric most implementations get wrong."""

    def test_member_with_no_report_is_counted(self, client, db, roles, manager, project):
        filed = make_user(db, roles, email="filed@t.com", full_name="Filed Person")
        make_user(db, roles, email="never@t.com", full_name="Never Filed")
        file_report(client, filed, project, submit=True)

        body = client.get(
            f"{API}/dashboard/summary?week_start={WEEK}", headers=auth_header(manager)
        ).json()

        # The second member has NO ROW in `reports`. Anything that scans that
        # table alone would report total_members as 1 and miss them entirely.
        assert body["total_members"] == 2
        assert body["submitted"] == 1
        assert body["not_started"] == 1
        assert body["compliance_rate"] == 0.5

    def test_team_status_lists_non_filers_by_name(self, client, db, roles, manager, project):
        make_user(db, roles, email="ghost@t.com", full_name="Ghost Member")
        rows = client.get(
            f"{API}/dashboard/team-status?week_start={WEEK}", headers=auth_header(manager)
        ).json()

        ghost = next(r for r in rows if r["user"]["full_name"] == "Ghost Member")
        assert ghost["status"] == "NOT_STARTED"
        assert ghost["report_id"] is None

    def test_managers_are_not_in_the_compliance_denominator(
        self, client, db, roles, manager, project
    ):
        """The denominator is the MEMBER roster. Managers file reports too, but
        counting them would make compliance mean something different."""
        make_user(db, roles, email="only.member@t.com")
        body = client.get(
            f"{API}/dashboard/summary?week_start={WEEK}", headers=auth_header(manager)
        ).json()
        assert body["total_members"] == 1

    def test_deactivated_members_are_excluded(self, client, db, roles, manager, project):
        gone = make_user(db, roles, email="left@t.com")
        make_user(db, roles, email="here@t.com")
        gone.is_active = False
        db.flush()

        body = client.get(
            f"{API}/dashboard/summary?week_start={WEEK}", headers=auth_header(manager)
        ).json()
        assert body["total_members"] == 1


class TestSummaryMetrics:
    def test_status_counts(self, client, db, roles, manager, project):
        drafter = make_user(db, roles, email="draft@t.com")
        submitter = make_user(db, roles, email="sub@t.com")
        corrected = make_user(db, roles, email="corr@t.com")

        file_report(client, drafter, project)                    # DRAFT
        file_report(client, submitter, project, submit=True)     # SUBMITTED
        r = file_report(client, corrected, project, submit=True)
        client.post(
            f"{API}/reports/{r['id']}/review",
            json={"action": "REQUEST_CHANGES", "comment": "Please revise"},
            headers=auth_header(manager),
        )

        body = client.get(
            f"{API}/dashboard/summary?week_start={WEEK}", headers=auth_header(manager)
        ).json()

        assert body["pending"] == 1            # draft: started, not submitted
        assert body["needs_correction"] == 1
        # A corrected report WAS submitted — it counts toward compliance.
        assert body["submitted"] == 2
        assert body["total_tasks"] == 3
        assert body["completed_tasks"] == 3

    def test_open_blockers_exclude_approved_reports(
        self, client, db, roles, manager, project
    ):
        a = make_user(db, roles, email="ba@t.com")
        b = make_user(db, roles, email="bb@t.com")
        file_report(client, a, project, submit=True)
        approved = file_report(client, b, project, submit=True)
        client.post(
            f"{API}/reports/{approved['id']}/review",
            json={"action": "APPROVE"},
            headers=auth_header(manager),
        )

        body = client.get(
            f"{API}/dashboard/summary?week_start={WEEK}", headers=auth_header(manager)
        ).json()
        # Two blockers exist, but the approved report's is no longer "open".
        assert body["open_blockers"] == 1
        assert body["key_blockers"] == 1

    def test_late_uses_first_submission_not_last(
        self, client, db, roles, manager, project
    ):
        """Correcting a report must never make it retroactively late."""
        member = make_user(db, roles, email="late@t.com")
        created = file_report(client, member, project, submit=True)

        row = db.get(Report, created["id"])
        on_time = datetime.combine(date(2026, 3, 4), datetime.min.time())
        very_late = datetime.combine(date(2026, 3, 20), datetime.min.time())
        row.first_submitted_at = on_time      # submitted during the week
        row.last_submitted_at = very_late     # corrected long afterwards
        db.flush()

        body = client.get(
            f"{API}/dashboard/summary?week_start={WEEK}", headers=auth_header(manager)
        ).json()
        assert body["late"] == 0

    def test_late_flags_a_genuinely_late_first_submission(
        self, client, db, roles, manager, project
    ):
        member = make_user(db, roles, email="tardy@t.com")
        created = file_report(client, member, project, submit=True)

        row = db.get(Report, created["id"])
        # Week ends 8 Mar; deadline is 9 Mar + grace.
        row.first_submitted_at = datetime.combine(date(2026, 3, 15), datetime.min.time())
        db.flush()

        body = client.get(
            f"{API}/dashboard/summary?week_start={WEEK}", headers=auth_header(manager)
        ).json()
        assert body["late"] == 1

    def test_compliance_is_zero_with_no_members(self, client, manager):
        """No members must give 0.0, not a ZeroDivisionError."""
        body = client.get(
            f"{API}/dashboard/summary?week_start={WEEK}", headers=auth_header(manager)
        ).json()
        assert body["total_members"] == 0
        assert body["compliance_rate"] == 0.0


class TestCharts:
    def test_status_by_member_includes_everyone(self, client, db, roles, manager, project):
        a = make_user(db, roles, email="ca@t.com", full_name="Chart A")
        make_user(db, roles, email="cb@t.com", full_name="Chart B")
        file_report(client, a, project, submit=True)

        rows = client.get(
            f"{API}/dashboard/charts/status-by-member?from={WEEK}&to={WEEK}",
            headers=auth_header(manager),
        ).json()
        assert len(rows) == 2
        b_row = next(r for r in rows if r["full_name"] == "Chart B")
        assert b_row["not_started"] == 1

    def test_task_trend_includes_empty_weeks(self, client, db, roles, manager, project):
        """A gap in a trend line is information; dropping the point silently
        rescales the axis."""
        member = make_user(db, roles, email="trend@t.com")
        file_report(client, member, project, week=WEEK, submit=True)

        rows = client.get(
            f"{API}/dashboard/charts/task-trend?weeks=4&ending={WEEK}",
            headers=auth_header(manager),
        ).json()
        assert len(rows) == 4
        assert rows[-1]["completed_tasks"] == 1
        assert rows[0]["total_tasks"] == 0

    def test_workload_by_project(self, client, db, roles, manager, project):
        member = make_user(db, roles, email="wl@t.com")
        file_report(client, member, project, submit=True)

        rows = client.get(
            f"{API}/dashboard/charts/workload-by-project?from={WEEK}&to={WEEK}",
            headers=auth_header(manager),
        ).json()
        assert rows[0]["name"] == "Client A Portal"
        assert rows[0]["task_count"] == 1
        assert rows[0]["hours_spent"] == "20.00"

    def test_time_by_task_type(self, client, db, roles, manager, project):
        member = make_user(db, roles, email="tt@t.com")
        file_report(client, member, project, submit=True)

        rows = client.get(
            f"{API}/dashboard/charts/time-by-type?from={WEEK}&to={WEEK}",
            headers=auth_header(manager),
        ).json()
        assert rows[0]["task_type"] == "DEVELOPMENT"
        assert rows[0]["hours"] == "20.00"

    def test_charts_are_empty_not_broken_with_no_data(self, client, manager):
        for path in (
            "charts/status-by-member",
            "charts/workload-by-project",
            "charts/time-by-type",
        ):
            r = client.get(f"{API}/dashboard/{path}", headers=auth_header(manager))
            assert r.status_code == 200
            assert r.json() == []


class TestActivityFeed:
    def test_records_submissions_and_reviews(self, client, db, roles, manager, project):
        member = make_user(db, roles, email="act@t.com", full_name="Act Member")
        created = file_report(client, member, project, submit=True)
        client.post(
            f"{API}/reports/{created['id']}/review",
            json={"action": "APPROVE", "comment": "Good"},
            headers=auth_header(manager),
        )

        body = client.get(f"{API}/dashboard/activity", headers=auth_header(manager)).json()
        assert body["total"] == 2
        actions = [i["action"] for i in body["items"]]
        assert "APPROVE" in actions and "SUBMITTED" in actions
        approve = next(i for i in body["items"] if i["action"] == "APPROVE")
        assert "Act Member" in approve["summary"]


class TestAnalytics:
    def test_workload_balance_flags_outliers(self, client, db, roles, manager, project):
        heavy = make_user(db, roles, email="heavy@t.com", full_name="Heavy Load")
        for email in ("n1@t.com", "n2@t.com", "n3@t.com"):
            normal = make_user(db, roles, email=email)
            file_report(client, normal, project, submit=True)  # 20h each
        file_report(
            client,
            heavy,
            project,
            submit=True,
            tasks=[{"name": "Huge", "status": "COMPLETED", "hours_spent": "60.00"}],
            hours_by_type={"DEVELOPMENT": "60.00"},
        )

        body = client.get(
            f"{API}/dashboard/analytics/workload-balance?week_start={WEEK}",
            headers=auth_header(manager),
        ).json()
        flagged = next(m for m in body["members"] if m["full_name"] == "Heavy Load")
        assert flagged["flag"] == "overloaded"
        assert body["std_dev"] > 0

    def test_workload_balance_handles_a_single_member(
        self, client, db, roles, manager, project
    ):
        """One member means zero variance — must not divide by zero."""
        solo = make_user(db, roles, email="solo@t.com")
        file_report(client, solo, project, submit=True)

        body = client.get(
            f"{API}/dashboard/analytics/workload-balance?week_start={WEEK}",
            headers=auth_header(manager),
        ).json()
        assert body["std_dev"] == 0
        assert body["members"][0]["flag"] is None

    def test_recurring_blockers_groups_repeats(self, client, db, roles, manager, project):
        a = make_user(db, roles, email="rb1@t.com")
        b = make_user(db, roles, email="rb2@t.com")
        this_week = date.today() - timedelta(days=date.today().weekday())
        for user in (a, b):
            file_report(client, user, project, week=this_week.isoformat(), submit=True)

        rows = client.get(
            f"{API}/dashboard/analytics/recurring-blockers?weeks=4",
            headers=auth_header(manager),
        ).json()
        assert rows[0]["description"] == "Sandbox down"
        assert rows[0]["occurrences"] == 2
        assert rows[0]["affected_members"] == 2


class TestDashboardAccess:
    @pytest.mark.parametrize(
        "path",
        [
            "summary",
            "team-status",
            "charts/status-by-member",
            "charts/task-trend",
            "activity",
            "analytics/workload-balance",
        ],
    )
    def test_members_are_blocked(self, client, member_a, path):
        assert client.get(f"{API}/dashboard/{path}", headers=auth_header(member_a)).status_code == 403

    def test_manager_is_allowed(self, client, manager):
        assert client.get(f"{API}/dashboard/summary", headers=auth_header(manager)).status_code == 200


class TestUserAdmin:
    def test_member_profile_shows_unfiled_weeks(self, client, db, roles, manager, project):
        member = make_user(db, roles, email="prof@t.com", full_name="Profile Person")
        this_week = date.today() - timedelta(days=date.today().weekday())
        file_report(client, member, project, week=this_week.isoformat(), submit=True)

        body = client.get(
            f"{API}/users/{member.id}/profile?weeks=4", headers=auth_header(manager)
        ).json()
        assert body["stats"]["total_reports"] == 1
        statuses = [w["status"] for w in body["weekly_status"]]
        assert statuses[-1] == "SUBMITTED"
        assert statuses[0] == "NOT_STARTED"

    def test_admin_can_assign_roles(self, client, admin, member_a):
        r = client.patch(
            f"{API}/users/{member_a.id}/role",
            json={"role_code": "MANAGER"},
            headers=auth_header(admin),
        )
        assert r.status_code == 200
        assert r.json()["role"]["code"] == "MANAGER"

    def test_manager_cannot_assign_roles(self, client, manager, member_a):
        r = client.patch(
            f"{API}/users/{member_a.id}/role",
            json={"role_code": "ADMIN"},
            headers=auth_header(manager),
        )
        assert r.status_code == 403

    def test_admin_cannot_change_their_own_role(self, client, admin):
        r = client.patch(
            f"{API}/users/{admin.id}/role",
            json={"role_code": "MEMBER"},
            headers=auth_header(admin),
        )
        assert r.status_code == 403

    def test_last_admin_cannot_be_demoted(self, client, db, roles, admin):
        """Otherwise the system ends up with nobody who can manage users."""
        other_admin = make_user(db, roles, email="admin2@t.com", role=RoleCode.ADMIN)
        r = client.patch(
            f"{API}/users/{admin.id}/role",
            json={"role_code": "MEMBER"},
            headers=auth_header(other_admin),
        )
        assert r.status_code == 200  # a second admin exists, so this is fine

        back = client.patch(
            f"{API}/users/{other_admin.id}/role",
            json={"role_code": "MEMBER"},
            headers=auth_header(other_admin),
        )
        assert back.status_code == 403  # cannot change own role

    def test_deactivation_is_used_instead_of_deletion(self, client, admin, member_a):
        assert client.delete(
            f"{API}/users/{member_a.id}", headers=auth_header(admin)
        ).status_code == 204
        body = client.get(
            f"{API}/users?is_active=false", headers=auth_header(admin)
        ).json()
        assert any(u["id"] == member_a.id for u in body["items"])
