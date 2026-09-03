"""Shared test fixtures.

Runs against a real MySQL/MariaDB test schema rather than SQLite: the app relies
on MySQL ENUM, stored generated columns and JSON. A suite that passes on SQLite
and fails on the real engine is worse than no suite.
"""
from __future__ import annotations

from collections.abc import Generator
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.database.base import Base
from app.database.session import get_db
from app.main import create_app
from app.models import RoleCode, User
from app.seeds.reference import seed_roles_and_permissions

TEST_URL = settings.TEST_DATABASE_URL or settings.DATABASE_URL.replace(
    "/weekly_reports?", "/weekly_reports_test?"
)


@pytest.fixture(scope="session")
def engine():
    eng = create_engine(TEST_URL, pool_pre_ping=True)
    # FK checks off so drop order does not matter.
    with eng.begin() as conn:
        conn.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
    Base.metadata.drop_all(eng)
    Base.metadata.create_all(eng)
    with eng.begin() as conn:
        conn.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
    yield eng
    eng.dispose()


@pytest.fixture
def db(engine) -> Generator[Session, None, None]:
    """Each test runs inside a transaction that is rolled back afterwards, so
    tests never see each other's data and the suite is order-independent.

    join_transaction_mode="create_savepoint" is what makes this robust: the
    application's own commit() and rollback() then operate on SAVEPOINTs inside
    our outer transaction rather than on the transaction itself. Without it, any
    code path that rolls back — the IntegrityError handlers, for instance —
    destroys the enclosing transaction and lets that test's rows leak into the
    database and into later tests.
    """
    connection = engine.connect()
    transaction = connection.begin()
    session = sessionmaker(
        bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
    )()

    yield session

    session.close()
    if transaction.is_active:
        transaction.rollback()
    connection.close()


@pytest.fixture
def roles(db: Session) -> dict:
    return seed_roles_and_permissions(db)


@pytest.fixture
def client(db: Session) -> Generator[TestClient, None, None]:
    app = create_app()
    # One line swaps the database for the entire app — no monkeypatching.
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def make_user(
    db: Session,
    roles: dict,
    *,
    email: str,
    role: RoleCode = RoleCode.MEMBER,
    password: str = "Password123",
    full_name: str = "Test User",
    is_active: bool = True,
) -> User:
    user = User(
        email=email,
        password_hash=hash_password(password),
        full_name=full_name,
        role_id=roles[role.value].id,
        is_active=is_active,
    )
    db.add(user)
    db.flush()
    return user


@pytest.fixture
def member_a(db: Session, roles: dict) -> User:
    return make_user(db, roles, email="member.a@test.com", full_name="Member A")


@pytest.fixture
def member_b(db: Session, roles: dict) -> User:
    return make_user(db, roles, email="member.b@test.com", full_name="Member B")


@pytest.fixture
def manager(db: Session, roles: dict) -> User:
    return make_user(
        db, roles, email="manager@test.com", role=RoleCode.MANAGER, full_name="Manager M"
    )


@pytest.fixture
def admin(db: Session, roles: dict) -> User:
    return make_user(
        db, roles, email="admin@test.com", role=RoleCode.ADMIN, full_name="Admin A"
    )


def auth_header(user: User, *, expired: bool = False) -> dict[str, str]:
    """Bearer header for a user. `expired=True` produces an already-dead token."""
    delta = timedelta(minutes=-5) if expired else timedelta(minutes=15)
    return {"Authorization": f"Bearer {create_access_token(user.id, expires_delta=delta)}"}
