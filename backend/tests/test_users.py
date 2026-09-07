"""Admin-side user administration.

The interesting cases are all about the boundary between "an admin may assign a
role" and "nobody may hand themselves one", which is what separates this
endpoint from self-registration.
"""
from __future__ import annotations

from app.models import RoleCode, User
from tests.conftest import auth_header, make_user

API = "/api/v1"


class TestCreateUser:
    def test_admin_creates_a_member_and_gets_a_one_time_password(self, client, admin):
        r = client.post(
            f"{API}/users",
            json={"email": "New.Person@test.com", "full_name": "New  Person"},
            headers=auth_header(admin),
        )
        assert r.status_code == 201
        body = r.json()

        assert body["email"] == "new.person@test.com"   # normalised
        assert body["full_name"] == "New Person"        # whitespace collapsed
        assert body["role"]["code"] == RoleCode.MEMBER.value
        assert body["is_active"] is True

        temporary = body["temporary_password"]
        assert temporary and len(temporary) >= 12
        # The generated value must satisfy the same rule user-supplied ones do.
        assert any(c.isalpha() for c in temporary) and any(c.isdigit() for c in temporary)

    def test_the_generated_password_actually_works(self, client, admin):
        created = client.post(
            f"{API}/users",
            json={"email": "login.me@test.com", "full_name": "Login Me"},
            headers=auth_header(admin),
        ).json()

        r = client.post(
            f"{API}/auth/login",
            json={"email": "login.me@test.com", "password": created["temporary_password"]},
        )
        assert r.status_code == 200

    def test_a_supplied_password_is_used_and_never_echoed(self, client, admin):
        r = client.post(
            f"{API}/users",
            json={
                "email": "chosen@test.com",
                "full_name": "Chosen Password",
                "password": "ChosenPass123",
            },
            headers=auth_header(admin),
        )
        assert r.status_code == 201
        # No password was generated, so nothing is returned to display.
        assert r.json()["temporary_password"] is None

        assert client.post(
            f"{API}/auth/login",
            json={"email": "chosen@test.com", "password": "ChosenPass123"},
        ).status_code == 200

    def test_admin_can_assign_a_role_at_creation(self, client, admin):
        r = client.post(
            f"{API}/users",
            json={
                "email": "new.manager@test.com",
                "full_name": "New Manager",
                "role_code": "MANAGER",
            },
            headers=auth_header(admin),
        )
        assert r.status_code == 201
        assert r.json()["role"]["code"] == RoleCode.MANAGER.value

    def test_new_account_reports_to_the_creating_admin_by_default(
        self, client, db, admin
    ):
        created = client.post(
            f"{API}/users",
            json={"email": "reports.to@test.com", "full_name": "Reports To"},
            headers=auth_header(admin),
        ).json()

        assert db.get(User, created["id"]).manager_id == admin.id

    def test_an_explicit_manager_can_be_given(self, client, db, admin, manager):
        created = client.post(
            f"{API}/users",
            json={
                "email": "explicit@test.com",
                "full_name": "Explicit Manager",
                "manager_id": manager.id,
            },
            headers=auth_header(admin),
        ).json()

        assert db.get(User, created["id"]).manager_id == manager.id

    def test_a_member_cannot_be_someone_else_s_manager(self, client, admin, member_a):
        r = client.post(
            f"{API}/users",
            json={
                "email": "bad.manager@test.com",
                "full_name": "Bad Manager",
                "manager_id": member_a.id,
            },
            headers=auth_header(admin),
        )
        assert r.status_code == 409

    def test_duplicate_email_conflicts(self, client, admin, member_a):
        r = client.post(
            f"{API}/users",
            json={"email": member_a.email, "full_name": "Duplicate"},
            headers=auth_header(admin),
        )
        assert r.status_code == 409
        assert r.json()["code"] == "conflict"

    def test_weak_password_is_rejected(self, client, admin):
        r = client.post(
            f"{API}/users",
            json={
                "email": "weak@test.com",
                "full_name": "Weak Password",
                "password": "passwordonly",   # no digit
            },
            headers=auth_header(admin),
        )
        assert r.status_code == 422

    def test_unknown_fields_are_rejected(self, client, admin):
        """`extra="forbid"` — a typo'd field must fail loudly, not be ignored."""
        r = client.post(
            f"{API}/users",
            json={
                "email": "extra@test.com",
                "full_name": "Extra Field",
                "is_active": False,
            },
            headers=auth_header(admin),
        )
        assert r.status_code == 422

    def test_password_hash_is_never_returned(self, client, admin):
        r = client.post(
            f"{API}/users",
            json={"email": "no.hash@test.com", "full_name": "No Hash"},
            headers=auth_header(admin),
        )
        assert "password_hash" not in r.json()


class TestCreateUserAccessControl:
    def test_a_member_cannot_create_users(self, client, member_a):
        r = client.post(
            f"{API}/users",
            json={"email": "sneaky@test.com", "full_name": "Sneaky Member"},
            headers=auth_header(member_a),
        )
        assert r.status_code == 403

    def test_a_manager_cannot_create_users(self, client, manager):
        """Creation carries a role, so it sits behind `user.manage_roles` —
        which a manager does not have. Otherwise a manager could mint an admin."""
        r = client.post(
            f"{API}/users",
            json={"email": "by.manager@test.com", "full_name": "By Manager"},
            headers=auth_header(manager),
        )
        assert r.status_code == 403

    def test_an_anonymous_caller_cannot_create_users(self, client):
        r = client.post(
            f"{API}/users",
            json={"email": "anon@test.com", "full_name": "Anonymous"},
        )
        assert r.status_code == 401

    def test_a_deactivated_admin_cannot_create_users(self, client, db, roles):
        dead = make_user(
            db,
            roles,
            email="dead.admin@test.com",
            role=RoleCode.ADMIN,
            is_active=False,
        )
        r = client.post(
            f"{API}/users",
            json={"email": "ghost@test.com", "full_name": "Ghost User"},
            headers=auth_header(dead),
        )
        assert r.status_code == 401
