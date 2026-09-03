"""Authentication and token-handling tests."""
from __future__ import annotations

import pytest

from app.core.security import create_refresh_token
from app.models import RoleCode
from tests.conftest import auth_header, make_user

API = "/api/v1"


class TestRegistration:
    def test_creates_a_member_account(self, client, roles):
        r = client.post(
            f"{API}/auth/register",
            json={"email": "new@test.com", "password": "Password123", "full_name": "New User"},
        )
        assert r.status_code == 201
        body = r.json()
        assert body["email"] == "new@test.com"
        assert body["role"]["code"] == "MEMBER"
        # The hash must never cross the wire.
        assert "password" not in body and "password_hash" not in body

    def test_rejects_duplicate_email(self, client, roles, member_a):
        r = client.post(
            f"{API}/auth/register",
            json={"email": member_a.email, "password": "Password123", "full_name": "Copy Cat"},
        )
        assert r.status_code == 409

    def test_email_is_normalised_to_lowercase(self, client, roles):
        client.post(
            f"{API}/auth/register",
            json={"email": "MiXeD@Test.com", "password": "Password123", "full_name": "Mixed Case"},
        )
        r = client.post(
            f"{API}/auth/login", json={"email": "mixed@test.com", "password": "Password123"}
        )
        assert r.status_code == 200

    @pytest.mark.parametrize(
        "password", ["short1", "alllettersnodigits", "12345678", ""]
    )
    def test_rejects_weak_passwords(self, client, roles, password):
        r = client.post(
            f"{API}/auth/register",
            json={"email": "weak@test.com", "password": password, "full_name": "Weak Pass"},
        )
        assert r.status_code == 422

    def test_cannot_self_assign_a_role(self, client, roles):
        """Privilege escalation guard: `role` is not part of the schema, and
        extra='forbid' turns the attempt into a 422 rather than ignoring it."""
        r = client.post(
            f"{API}/auth/register",
            json={
                "email": "sneaky@test.com",
                "password": "Password123",
                "full_name": "Sneaky User",
                "role": "ADMIN",
            },
        )
        assert r.status_code == 422


class TestLogin:
    def test_returns_token_and_permissions(self, client, roles, member_a):
        r = client.post(
            f"{API}/auth/login", json={"email": member_a.email, "password": "Password123"}
        )
        assert r.status_code == 200
        body = r.json()
        assert body["token_type"] == "bearer"
        assert body["expires_in"] > 0
        # The frontend renders from permission codes, never role names.
        assert set(body["user"]["permissions"]) == {
            "report.create_own", "report.edit_own", "report.submit_own", "report.view_own",
        }

    def test_sets_httponly_refresh_cookie(self, client, roles, member_a):
        r = client.post(
            f"{API}/auth/login", json={"email": member_a.email, "password": "Password123"}
        )
        cookie = r.headers.get("set-cookie", "")
        assert "refresh_token=" in cookie
        assert "HttpOnly" in cookie          # unreadable by JavaScript
        assert "Path=/api/v1/auth" in cookie  # scoped to the routes that need it
        # The refresh token must not also appear in the JSON body.
        assert "refresh_token" not in r.json()

    def test_wrong_password_is_401(self, client, roles, member_a):
        r = client.post(
            f"{API}/auth/login", json={"email": member_a.email, "password": "WrongPass123"}
        )
        assert r.status_code == 401

    def test_unknown_email_gives_the_same_message(self, client, roles, member_a):
        """No user-enumeration oracle: both failures are indistinguishable."""
        unknown = client.post(
            f"{API}/auth/login", json={"email": "ghost@test.com", "password": "WrongPass123"}
        )
        wrong = client.post(
            f"{API}/auth/login", json={"email": member_a.email, "password": "WrongPass123"}
        )
        assert unknown.status_code == wrong.status_code == 401
        assert unknown.json()["detail"] == wrong.json()["detail"]

    def test_deactivated_account_cannot_log_in(self, client, db, roles):
        user = make_user(db, roles, email="gone@test.com", is_active=False)
        r = client.post(
            f"{API}/auth/login", json={"email": user.email, "password": "Password123"}
        )
        assert r.status_code == 401


class TestTokenHandling:
    def test_me_requires_a_token(self, client):
        assert client.get(f"{API}/auth/me").status_code == 401

    def test_expired_token_is_rejected(self, client, roles, member_a):
        r = client.get(f"{API}/auth/me", headers=auth_header(member_a, expired=True))
        assert r.status_code == 401

    def test_malformed_token_is_rejected(self, client):
        r = client.get(f"{API}/auth/me", headers={"Authorization": "Bearer not.a.jwt"})
        assert r.status_code == 401

    def test_refresh_token_cannot_authenticate_a_request(self, client, roles, member_a):
        """The `type` claim is what makes the short access-token TTL meaningful.
        Without this check the 7-day credential would work on every route."""
        token = create_refresh_token(member_a.id)
        r = client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 401

    def test_deactivated_user_token_stops_working_immediately(
        self, client, db, roles, member_a
    ):
        header = auth_header(member_a)
        assert client.get(f"{API}/auth/me", headers=header).status_code == 200
        member_a.is_active = False
        db.flush()
        assert client.get(f"{API}/auth/me", headers=header).status_code == 401


class TestRefreshRotation:
    def test_refresh_rotates_and_old_token_dies(self, client, roles, member_a):
        login = client.post(
            f"{API}/auth/login", json={"email": member_a.email, "password": "Password123"}
        )
        old = login.cookies["refresh_token"]

        rotated = client.post(f"{API}/auth/refresh", cookies={"refresh_token": old})
        assert rotated.status_code == 200
        new = rotated.cookies["refresh_token"]
        assert new != old

        # Replaying a spent token is only possible if it was stolen, so the
        # whole family is revoked rather than merely refused.
        replay = client.post(f"{API}/auth/refresh", cookies={"refresh_token": old})
        assert replay.status_code == 401

        after_reuse = client.post(f"{API}/auth/refresh", cookies={"refresh_token": new})
        assert after_reuse.status_code == 401

    def test_refresh_without_cookie_is_401(self, client, roles):
        assert client.post(f"{API}/auth/refresh").status_code == 401

    def test_logout_revokes_the_refresh_token(self, client, roles, member_a):
        login = client.post(
            f"{API}/auth/login", json={"email": member_a.email, "password": "Password123"}
        )
        token = login.cookies["refresh_token"]

        assert client.post(f"{API}/auth/logout", cookies={"refresh_token": token}).status_code == 204
        # Logout is real server-side revocation, not just dropping the cookie.
        assert client.post(f"{API}/auth/refresh", cookies={"refresh_token": token}).status_code == 401


class TestChangePassword:
    def test_requires_the_current_password(self, client, roles, member_a):
        r = client.post(
            f"{API}/auth/change-password",
            json={"current_password": "WrongPass123", "new_password": "NewPassword456"},
            headers=auth_header(member_a),
        )
        assert r.status_code == 401

    def test_changes_password_and_revokes_sessions(self, client, roles, member_a):
        login = client.post(
            f"{API}/auth/login", json={"email": member_a.email, "password": "Password123"}
        )
        old_refresh = login.cookies["refresh_token"]

        r = client.post(
            f"{API}/auth/change-password",
            json={"current_password": "Password123", "new_password": "NewPassword456"},
            headers=auth_header(member_a),
        )
        assert r.status_code == 204

        assert client.post(
            f"{API}/auth/login", json={"email": member_a.email, "password": "Password123"}
        ).status_code == 401
        assert client.post(
            f"{API}/auth/login", json={"email": member_a.email, "password": "NewPassword456"}
        ).status_code == 200
        # Other sessions must not survive a password change.
        assert client.post(
            f"{API}/auth/refresh", cookies={"refresh_token": old_refresh}
        ).status_code == 401


class TestRolePermissions:
    @pytest.mark.parametrize(
        "role,expected_count", [(RoleCode.MEMBER, 4), (RoleCode.MANAGER, 10), (RoleCode.ADMIN, 11)]
    )
    def test_each_role_has_the_expected_grants(self, client, db, roles, role, expected_count):
        user = make_user(db, roles, email=f"{role.value.lower()}@perm.com", role=role)
        r = client.get(f"{API}/auth/me", headers=auth_header(user))
        assert r.status_code == 200
        assert len(r.json()["permissions"]) == expected_count

    def test_only_managers_and_admins_can_view_all_reports(self, client, db, roles):
        member = make_user(db, roles, email="m@perm.com", role=RoleCode.MEMBER)
        manager = make_user(db, roles, email="g@perm.com", role=RoleCode.MANAGER)

        member_perms = client.get(f"{API}/auth/me", headers=auth_header(member)).json()["permissions"]
        manager_perms = client.get(f"{API}/auth/me", headers=auth_header(manager)).json()["permissions"]

        assert "report.view_all" not in member_perms
        assert "report.review" not in member_perms
        assert "report.view_all" in manager_perms
        assert "report.review" in manager_perms

    def test_only_admin_can_manage_roles(self, client, db, roles):
        manager = make_user(db, roles, email="g2@perm.com", role=RoleCode.MANAGER)
        admin = make_user(db, roles, email="a2@perm.com", role=RoleCode.ADMIN)

        manager_perms = client.get(f"{API}/auth/me", headers=auth_header(manager)).json()["permissions"]
        admin_perms = client.get(f"{API}/auth/me", headers=auth_header(admin)).json()["permissions"]

        assert "user.manage_roles" not in manager_perms
        assert "user.manage_roles" in admin_perms
