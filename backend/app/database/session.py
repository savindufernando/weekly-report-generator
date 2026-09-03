"""Engine and session lifecycle."""
from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    echo=settings.SQL_ECHO,
    # MySQL/MariaDB close idle connections at wait_timeout (8h by default, but
    # far shorter on hosted instances). pool_pre_ping revalidates a pooled
    # connection before handing it out, which is what prevents the classic
    # "MySQL server has gone away" after the app sits idle.
    pool_pre_ping=True,
    pool_recycle=1800,
    pool_size=5,
    max_overflow=10,
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    # Keeps attributes readable after commit, so a service can return the ORM
    # object and let the router serialise it without a second query.
    expire_on_commit=False,
)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: one session per request, always closed."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
