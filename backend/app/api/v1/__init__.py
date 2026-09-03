"""Aggregates every v1 router under a single include."""
from fastapi import APIRouter

from app.api.v1 import auth, dashboard, projects, reports, reviews, users

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(projects.router)
# reviews before reports: /reports/{id}/submit must match before /reports/{id}
api_router.include_router(reviews.router)
api_router.include_router(reports.router)
api_router.include_router(dashboard.router)
api_router.include_router(users.router)

__all__ = ["api_router"]
