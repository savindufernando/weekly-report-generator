"""Declarative base, shared column types and mixins."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import text
from sqlalchemy.dialects.mysql import BIGINT, DATETIME, SMALLINT
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


def utc_datetime() -> DATETIME:
    """DATETIME with microsecond precision.

    Plain DATETIME stores whole seconds, so two submissions or two review
    actions within the same second compare as equal — and anything ordered by
    timestamp (version timelines, comment history, the activity feed) then comes
    back in arbitrary order. fsp=6 makes those orderings deterministic.

    Every ordered query also carries `id` as a tiebreaker, because equal
    timestamps must never mean an unstable sort.
    """
    return DATETIME(fsp=6)


#: Server-side default matching the column precision.
NOW_6 = text("CURRENT_TIMESTAMP(6)")


# MySQL/MariaDB unsigned integer types, used consistently for keys.
# BIGINT AUTO_INCREMENT rather than UUID: MySQL 8 has no native UUID column, and
# random UUIDs as a clustered primary key cause page splits and index bloat in
# InnoDB. Sequential integers cluster well.
BigIntPK = BIGINT(unsigned=True)
SmallIntPK = SMALLINT(unsigned=True)


class TimestampMixin:
    """created_at / updated_at maintained by the database, not the application.

    DATETIME rather than TIMESTAMP: TIMESTAMP is bounded by 2038 and silently
    converts by session timezone, which is a real source of off-by-one-week
    bugs in an app keyed on week boundaries. All values are UTC.
    """

    created_at: Mapped[datetime] = mapped_column(
        utc_datetime(), server_default=NOW_6, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        utc_datetime(), server_default=NOW_6, server_onupdate=NOW_6, nullable=False
    )
