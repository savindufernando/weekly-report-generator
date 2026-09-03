"""Role-based access control.

The brief calls an automated test of RBAC "strongly recommended" and states the
rule these tests exist to prove:

    "a team member must never be able to access another team member's report
     data or a manager-only endpoint"

That is two different rules — object ownership and role capability — so both
are covered here.
"""
from __future__ import annotations

import pytest

from app.models import RoleCode
from tests.conftest import auth_header, make_user

API = "/api/v1"


@pytest.fixture
def project(client, db, roles, admin):
    r = client.post(
        f"{API}/projects",
        json={"name": "Client A Portal", "code": "CLIA", "color": "#2a78d6"},
        headers=auth_header(admin),
    )
    assert r.status_code == 201
    return r.json()


@pytest.fixture
def report_of_b(client, member_b, project):
    """A report owned by member B, used as the thing member A must not reach."""
    r = client.post(
        f"{API}/reports",
        json={"week_start": "2026-03-02", "project_id": project["id"]},
        headers=auth_header(member_b),
    )
    assert r.status_code == 201
    return r.json()


VALID_CONTENT = {
    "project_id": 1,
    "notes": "rewritten by someone else",
    "links": [],
    "tasks": [{"name": "Injected task"}],
    "next_week_tasks": [],
    "blockers": [],
    "achievements": [],
    "hours_by_type": {},
}


class TestObjectLevelAccess:
    """Ownership. Role checks alone cannot answer these."""

    def test_member_cannot_read_another_members_report(self, client, member_a, report_of_b):
        r = client.get(f"{API}/reports/{report_of_b['id']}", headers=auth_header(member_a))
        # 404, not 403: a 403 would confirm the record exists.
        assert r.status_code == 404

    def test_member_cannot_edit_another_members_report(
        self, client, member_a, report_of_b, project
    ):
        r = client.put(
            f"{API}/reports/{report_of_b['id']}",
            json={**VALID_CONTENT, "project_id": project["id"]},
            headers=auth_header(member_a),
        )
        assert r.status_code == 404

    def test_member_cannot_delete_another_members_report(self, client, member_a, report_of_b):
        r = client.delete(f"{API}/reports/{report_of_b['id']}", headers=auth_header(member_a))
        assert r.status_code == 404

    def test_owner_can_read_their_own_report(self, client, member_b, report_of_b):
        r = client.get(f"{API}/reports/{report_of_b['id']}", headers=auth_header(member_b))
        assert r.status_code == 200

    def test_manager_can_read_any_report(self, client, manager, report_of_b):
        r = client.get(f"{API}/reports/{report_of_b['id']}", headers=auth_header(manager))
        assert r.status_code == 200

    def test_nonexistent_report_is_also_404(self, client, member_a):
        """Same status as "not yours", so the two are indistinguishable."""
        assert client.get(f"{API}/reports/999999", headers=auth_header(member_a)).status_code == 404


class TestManagerCannotEditContent:
    """Ownership, not seniority, governs content."""

    def test_manager_cannot_put_report_content(self, client, manager, report_of_b, project):
        r = client.put(
            f"{API}/reports/{report_of_b['id']}",
            json={**VALID_CONTENT, "project_id": project["id"]},
            headers=auth_header(manager),
        )
        assert r.status_code == 403

    def test_admin_cannot_put_report_content_either(
        self, client, admin, report_of_b, project
    ):
        r = client.put(
            f"{API}/reports/{report_of_b['id']}",
            json={**VALID_CONTENT, "project_id": project["id"]},
            headers=auth_header(admin),
        )
        assert r.status_code == 403

    def test_content_is_unchanged_after_a_rejected_attempt(
        self, client, manager, member_b, report_of_b, project
    ):
        client.put(
            f"{API}/reports/{report_of_b['id']}",
            json={**VALID_CONTENT, "project_id": project["id"]},
            headers=auth_header(manager),
        )
        after = client.get(
            f"{API}/reports/{report_of_b['id']}", headers=auth_header(member_b)
        ).json()
        assert after["notes"] is None
        assert after["tasks"] == []


class TestListScoping:
    def test_member_list_contains_only_their_own(
        self, client, member_a, member_b, report_of_b, project
    ):
        client.post(
            f"{API}/reports",
            json={"week_start": "2026-03-02", "project_id": project["id"]},
            headers=auth_header(member_a),
        )
        body = client.get(f"{API}/reports", headers=auth_header(member_a)).json()
        assert body["total"] == 1
        assert all(item["user"]["id"] == member_a.id for item in body["items"])

    def test_explicit_user_id_filter_cannot_widen_scope(
        self, client, member_a, member_b, report_of_b
    ):
        """The scope clause and the filter are ANDed, so this yields nothing
        rather than another member's data."""
        r = client.get(
            f"{API}/reports?user_id={member_b.id}", headers=auth_header(member_a)
        )
        assert r.status_code == 200
        assert r.json()["items"] == []

    def test_manager_list_is_unscoped(self, client, manager, report_of_b):
        body = client.get(f"{API}/reports", headers=auth_header(manager)).json()
        assert any(item["id"] == report_of_b["id"] for item in body["items"])


class TestRoleLevelAccess:
    @pytest.mark.parametrize(
        "method,path,payload",
        [
            ("post", f"{API}/projects", {"name": "Nope", "code": "NOPE"}),
            ("patch", f"{API}/projects/1", {"name": "Renamed"}),
            ("delete", f"{API}/projects/1", None),
        ],
    )
    def test_member_cannot_manage_projects(self, client, member_a, project, method, path, payload):
        call = getattr(client, method)
        r = call(path, json=payload, headers=auth_header(member_a)) if payload else call(
            path, headers=auth_header(member_a)
        )
        assert r.status_code == 403

    def test_member_can_read_projects(self, client, member_a, project):
        """Members need the project list to tag a report — read is allowed."""
        assert client.get(f"{API}/projects", headers=auth_header(member_a)).status_code == 200

    def test_manager_can_manage_projects(self, client, manager):
        r = client.post(
            f"{API}/projects",
            json={"name": "Manager Made", "code": "MGRM"},
            headers=auth_header(manager),
        )
        assert r.status_code == 201


class TestUnauthenticated:
    @pytest.mark.parametrize(
        "path", [f"{API}/reports", f"{API}/projects", f"{API}/auth/me"]
    )
    def test_requires_authentication(self, client, path):
        assert client.get(path).status_code == 401

    def test_deactivated_member_loses_access_immediately(
        self, client, db, roles, project
    ):
        user = make_user(db, roles, email="soon.gone@test.com", role=RoleCode.MEMBER)
        header = auth_header(user)
        assert client.get(f"{API}/reports", headers=header).status_code == 200
        user.is_active = False
        db.flush()
        assert client.get(f"{API}/reports", headers=header).status_code == 401
