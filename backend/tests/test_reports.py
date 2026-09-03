"""Report CRUD and business rules."""
from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.utils.week import monday_of
from tests.conftest import auth_header

API = "/api/v1"


@pytest.fixture
def project(client, admin):
    return client.post(
        f"{API}/projects",
        json={"name": "Internal Tooling", "code": "INTL", "color": "#eb6834"},
        headers=auth_header(admin),
    ).json()


def content(project_id: int, **overrides) -> dict:
    base = {
        "project_id": project_id,
        "notes": "Sprint 14 wrap-up",
        "links": [{"label": "PR #482", "url": "https://example.com/pr/482"}],
        "tasks": [
            {
                "name": "Payment API integration",
                "priority": "HIGH",
                "status": "COMPLETED",
                "planned_pct": 100,
                "actual_pct": 100,
                "hours_planned": "16.00",
                "hours_spent": "18.50",
                "deliverable": "PR #482 merged",
            }
        ],
        "next_week_tasks": [{"description": "Refund flow", "priority": "HIGH"}],
        "blockers": [
            {"description": "Sandbox down", "severity": "HIGH", "is_key": True},
            {"description": "Waiting on design", "severity": "LOW", "is_key": False},
        ],
        "achievements": [{"description": "Cut checkout latency 40%", "is_key": True}],
        "hours_by_type": {"DEVELOPMENT": "26.00", "MEETINGS": "4.50"},
    }
    base.update(overrides)
    return base


class TestWeekIdentity:
    def test_any_day_is_normalised_to_monday(self, client, member_a, project):
        # 2026-03-04 is a Wednesday.
        r = client.post(
            f"{API}/reports",
            json={"week_start": "2026-03-04", "project_id": project["id"]},
            headers=auth_header(member_a),
        )
        assert r.status_code == 201
        assert r.json()["week_start"] == "2026-03-02"  # the Monday

    def test_week_end_is_derived_by_the_database(self, client, member_a, project):
        r = client.post(
            f"{API}/reports",
            json={"week_start": "2026-03-02", "project_id": project["id"]},
            headers=auth_header(member_a),
        )
        assert r.json()["week_end"] == "2026-03-08"  # Monday + 6

    def test_one_report_per_user_per_week(self, client, member_a, project):
        payload = {"week_start": "2026-03-02", "project_id": project["id"]}
        assert client.post(f"{API}/reports", json=payload, headers=auth_header(member_a)).status_code == 201
        second = client.post(f"{API}/reports", json=payload, headers=auth_header(member_a))
        assert second.status_code == 409

    def test_different_days_of_the_same_week_collide(self, client, member_a, project):
        """Normalisation means Monday and Wednesday are the same week."""
        client.post(
            f"{API}/reports",
            json={"week_start": "2026-03-02", "project_id": project["id"]},
            headers=auth_header(member_a),
        )
        r = client.post(
            f"{API}/reports",
            json={"week_start": "2026-03-06", "project_id": project["id"]},
            headers=auth_header(member_a),
        )
        assert r.status_code == 409

    def test_two_members_can_file_for_the_same_week(
        self, client, member_a, member_b, project
    ):
        payload = {"week_start": "2026-03-02", "project_id": project["id"]}
        assert client.post(f"{API}/reports", json=payload, headers=auth_header(member_a)).status_code == 201
        assert client.post(f"{API}/reports", json=payload, headers=auth_header(member_b)).status_code == 201

    def test_cannot_create_far_future_report(self, client, member_a, project):
        far = monday_of(date.today()) + timedelta(weeks=3)
        r = client.post(
            f"{API}/reports",
            json={"week_start": far.isoformat(), "project_id": project["id"]},
            headers=auth_header(member_a),
        )
        assert r.status_code == 422


class TestContentUpdate:
    def test_full_content_round_trip(self, client, member_a, project):
        created = client.post(
            f"{API}/reports",
            json={"week_start": "2026-03-02", "project_id": project["id"]},
            headers=auth_header(member_a),
        ).json()

        r = client.put(
            f"{API}/reports/{created['id']}",
            json=content(project["id"]),
            headers=auth_header(member_a),
        )
        assert r.status_code == 200
        body = r.json()
        assert len(body["tasks"]) == 1
        assert body["tasks"][0]["name"] == "Payment API integration"
        assert len(body["blockers"]) == 2
        assert body["hours_by_type"]["DEVELOPMENT"] == "26.00"
        assert body["links"][0]["label"] == "PR #482"

    def test_update_replaces_rather_than_appends(self, client, member_a, project):
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
        r = client.put(
            f"{API}/reports/{created['id']}",
            json=content(project["id"], tasks=[{"name": "Only task now"}], blockers=[]),
            headers=auth_header(member_a),
        )
        assert r.status_code == 200, r.json()
        assert len(r.json()["tasks"]) == 1
        assert r.json()["tasks"][0]["name"] == "Only task now"
        assert r.json()["blockers"] == []

    def test_rejects_two_key_blockers(self, client, member_a, project):
        created = client.post(
            f"{API}/reports",
            json={"week_start": "2026-03-02", "project_id": project["id"]},
            headers=auth_header(member_a),
        ).json()
        r = client.put(
            f"{API}/reports/{created['id']}",
            json=content(
                project["id"],
                blockers=[
                    {"description": "First", "is_key": True},
                    {"description": "Second", "is_key": True},
                ],
            ),
            headers=auth_header(member_a),
        )
        assert r.status_code == 422

    def test_rejects_two_key_achievements(self, client, member_a, project):
        created = client.post(
            f"{API}/reports",
            json={"week_start": "2026-03-02", "project_id": project["id"]},
            headers=auth_header(member_a),
        ).json()
        r = client.put(
            f"{API}/reports/{created['id']}",
            json=content(
                project["id"],
                achievements=[
                    {"description": "One", "is_key": True},
                    {"description": "Two", "is_key": True},
                ],
            ),
            headers=auth_header(member_a),
        )
        assert r.status_code == 422

    @pytest.mark.parametrize("field,value", [("planned_pct", 150), ("actual_pct", -5)])
    def test_rejects_out_of_range_percentages(self, client, member_a, project, field, value):
        created = client.post(
            f"{API}/reports",
            json={"week_start": "2026-03-02", "project_id": project["id"]},
            headers=auth_header(member_a),
        ).json()
        task = {"name": "Bad task", field: value}
        r = client.put(
            f"{API}/reports/{created['id']}",
            json=content(project["id"], tasks=[task]),
            headers=auth_header(member_a),
        )
        assert r.status_code == 422

    def test_rejects_unknown_fields(self, client, member_a, project):
        """extra='forbid' — an unknown field is an error, not silently dropped."""
        created = client.post(
            f"{API}/reports",
            json={"week_start": "2026-03-02", "project_id": project["id"]},
            headers=auth_header(member_a),
        ).json()
        payload = content(project["id"])
        payload["status"] = "APPROVED"  # trying to self-approve
        r = client.put(
            f"{API}/reports/{created['id']}", json=payload, headers=auth_header(member_a)
        )
        assert r.status_code == 422

    def test_rejects_impossible_total_hours(self, client, member_a, project):
        created = client.post(
            f"{API}/reports",
            json={"week_start": "2026-03-02", "project_id": project["id"]},
            headers=auth_header(member_a),
        ).json()
        r = client.put(
            f"{API}/reports/{created['id']}",
            json=content(
                project["id"],
                hours_by_type={"DEVELOPMENT": "100.00", "TESTING": "100.00"},
            ),
            headers=auth_header(member_a),
        )
        assert r.status_code == 422


class TestListing:
    @pytest.fixture
    def many_reports(self, client, member_a, project):
        base = monday_of(date(2026, 1, 5))
        for i in range(5):
            client.post(
                f"{API}/reports",
                json={
                    "week_start": (base + timedelta(weeks=i)).isoformat(),
                    "project_id": project["id"],
                },
                headers=auth_header(member_a),
            )

    def test_pagination_envelope(self, client, member_a, many_reports):
        r = client.get(f"{API}/reports?limit=2&offset=0", headers=auth_header(member_a))
        body = r.json()
        assert body["total"] == 5
        assert len(body["items"]) == 2
        assert body["limit"] == 2 and body["offset"] == 0

    def test_pages_do_not_overlap(self, client, member_a, many_reports):
        first = client.get(f"{API}/reports?limit=2&offset=0", headers=auth_header(member_a)).json()
        second = client.get(f"{API}/reports?limit=2&offset=2", headers=auth_header(member_a)).json()
        assert {i["id"] for i in first["items"]}.isdisjoint({i["id"] for i in second["items"]})

    def test_limit_is_capped(self, client, member_a, many_reports):
        """?limit=100000 must not be a way to exhaust memory."""
        assert client.get(f"{API}/reports?limit=100000", headers=auth_header(member_a)).status_code == 422

    def test_filter_by_week(self, client, member_a, many_reports):
        r = client.get(f"{API}/reports?week_start=2026-01-05", headers=auth_header(member_a))
        assert r.json()["total"] == 1

    def test_filter_by_status(self, client, member_a, many_reports):
        assert client.get(f"{API}/reports?status=DRAFT", headers=auth_header(member_a)).json()["total"] == 5
        assert client.get(f"{API}/reports?status=APPROVED", headers=auth_header(member_a)).json()["total"] == 0

    def test_list_item_carries_aggregates(self, client, member_a, project):
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
        item = client.get(f"{API}/reports", headers=auth_header(member_a)).json()["items"][0]
        assert item["task_count"] == 1
        assert item["completed_task_count"] == 1
        assert item["total_hours_spent"] == "18.50"
        assert item["key_blocker"] == "Sandbox down"


class TestDeletion:
    def test_draft_can_be_deleted(self, client, member_a, project):
        created = client.post(
            f"{API}/reports",
            json={"week_start": "2026-03-02", "project_id": project["id"]},
            headers=auth_header(member_a),
        ).json()
        assert client.delete(f"{API}/reports/{created['id']}", headers=auth_header(member_a)).status_code == 204
        assert client.get(f"{API}/reports/{created['id']}", headers=auth_header(member_a)).status_code == 404


class TestProjects:
    def test_archives_instead_of_deleting_when_referenced(
        self, client, admin, member_a, project
    ):
        client.post(
            f"{API}/reports",
            json={"week_start": "2026-03-02", "project_id": project["id"]},
            headers=auth_header(member_a),
        )
        r = client.delete(f"{API}/projects/{project['id']}", headers=auth_header(admin))
        assert r.status_code == 204
        assert r.headers["X-Delete-Mode"] == "archived"
        # Still present, just archived — history must survive.
        listed = client.get(
            f"{API}/projects?include_archived=true", headers=auth_header(admin)
        ).json()
        assert any(p["id"] == project["id"] and p["is_archived"] for p in listed)

    def test_hard_deletes_when_unreferenced(self, client, admin, project):
        r = client.delete(f"{API}/projects/{project['id']}", headers=auth_header(admin))
        assert r.status_code == 204
        assert r.headers["X-Delete-Mode"] == "deleted"

    def test_archived_project_cannot_start_a_new_report(
        self, client, admin, member_a, project
    ):
        client.patch(
            f"{API}/projects/{project['id']}",
            json={"is_archived": True},
            headers=auth_header(admin),
        )
        r = client.post(
            f"{API}/reports",
            json={"week_start": "2026-03-02", "project_id": project["id"]},
            headers=auth_header(member_a),
        )
        assert r.status_code == 422

    def test_duplicate_code_is_rejected(self, client, admin, project):
        r = client.post(
            f"{API}/projects",
            json={"name": "Different Name", "code": project["code"]},
            headers=auth_header(admin),
        )
        assert r.status_code == 409
