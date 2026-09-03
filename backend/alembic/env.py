"""Alembic environment.

Reads the URL from application settings rather than alembic.ini, so there is one
source of truth and no credentials committed to disk.
"""
from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import settings
from app.database.base import Base

config = context.config
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

_NOW_DEFAULTS = {"now()", "current_timestamp", "current_timestamp()", "CURRENT_TIMESTAMP"}


def _compare_server_default(
    context, inspected_column, metadata_column, inspected_default, metadata_default, rendered
) -> bool | None:
    """Suppress a MariaDB false positive.

    The model renders ``func.now()`` while MariaDB reports the same default as
    ``current_timestamp()``. Compared as strings they differ, so autogenerate
    emits an alter_column for every timestamp column on every run — noise that
    invites someone to apply a meaningless migration. Returning False means
    "no difference"; None falls back to the default comparison.
    """
    inspected = (inspected_default or "").strip().lower().rstrip()
    rendered_meta = (rendered or "").strip().lower()
    if inspected in _NOW_DEFAULTS and rendered_meta in _NOW_DEFAULTS:
        return False
    return None


def run_migrations_offline() -> None:
    context.configure(
        url=settings.DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=_compare_server_default,
        )
        # NOTE: MySQL/MariaDB have no transactional DDL. This transaction does
        # not make the migration atomic — a failure part-way leaves the schema
        # partially applied. Keep migrations small and individually reversible.
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
