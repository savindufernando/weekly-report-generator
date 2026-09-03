"""Week identity.

Every week calculation in the system goes through here. The client never
decides which week a report belongs to: a member in a different timezone would
otherwise compute a different Monday from the same instant, file against the
wrong week, and trip the (user_id, week_start) unique constraint.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta


def monday_of(value: date | datetime) -> date:
    """The ISO Monday of the week containing `value`."""
    if isinstance(value, datetime):
        value = value.date()
    return value - timedelta(days=value.weekday())


def week_end_of(week_start: date) -> date:
    """The Sunday closing the week. Mirrors the generated column in SQL."""
    return week_start + timedelta(days=6)


def current_week_start() -> date:
    return monday_of(date.today())


def week_range(*, weeks: int, ending: date | None = None) -> list[date]:
    """`weeks` consecutive Mondays, oldest first, ending with `ending`'s week."""
    last = monday_of(ending or date.today())
    return [last - timedelta(weeks=offset) for offset in range(weeks - 1, -1, -1)]


def format_week(week_start: date) -> str:
    """Human label, e.g. "2 - 8 Mar 2026"."""
    end = week_end_of(week_start)
    if week_start.month == end.month:
        return f"{week_start.day} - {end.day} {end:%b %Y}"
    if week_start.year == end.year:
        return f"{week_start.day} {week_start:%b} - {end.day} {end:%b %Y}"
    return f"{week_start.day} {week_start:%b %Y} - {end.day} {end:%b %Y}"
