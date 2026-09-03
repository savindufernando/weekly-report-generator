"""Pagination parsing.

The brief requires pagination and/or filtering on any endpoint returning a list
of reports, so this is a shared dependency rather than per-route parameters.
"""
from __future__ import annotations

from dataclasses import dataclass

from fastapi import Query

from app.core.config import settings


@dataclass
class Pagination:
    limit: int
    offset: int


def pagination(
    limit: int = Query(
        settings.DEFAULT_PAGE_SIZE,
        ge=1,
        # The cap is the point: without it, ?limit=1000000 is a trivial way to
        # exhaust memory on a list endpoint.
        le=settings.MAX_PAGE_SIZE,
        description="Rows per page (max 100)",
    ),
    offset: int = Query(0, ge=0, description="Rows to skip"),
) -> Pagination:
    return Pagination(limit=limit, offset=offset)
