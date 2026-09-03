"""Application factory.

A factory rather than a module-level `app = FastAPI()` so tests can build an app
bound to a test database without importing a singleton.
"""
from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings
from app.core.exceptions import AppException
from app.database.session import engine
from app.middleware.request_context import AccessLogMiddleware, RequestIDMiddleware

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
)
logger = logging.getLogger("app")


def _error_body(request: Request, detail: str, code: str, **extra) -> dict:
    """One error envelope for every failure, so the frontend has one parser."""
    body = {
        "detail": detail,
        "code": code,
        "request_id": getattr(request.state, "request_id", None),
    }
    if extra:
        body["context"] = extra
    return body


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppException)
    async def handle_app_exception(request: Request, exc: AppException):
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_body(request, exc.message, exc.code, **exc.context),
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exception(request: Request, exc: StarletteHTTPException):
        # Covers routes that raise HTTPException directly (the auth and object
        # gates) plus framework 404/405s, so every failure shares one envelope
        # and the frontend needs exactly one parser.
        codes = {401: "unauthenticated", 403: "forbidden", 404: "not_found",
                 405: "method_not_allowed", 409: "conflict"}
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_body(
                request, str(exc.detail), codes.get(exc.status_code, "http_error")
            ),
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError):
        # Field paths are preserved so the frontend can map errors onto inputs.
        return JSONResponse(
            status_code=422,
            content=_error_body(
                request,
                "Validation failed",
                "validation_error",
                errors=[
                    {"field": ".".join(str(p) for p in e["loc"][1:]), "message": e["msg"]}
                    for e in exc.errors()
                ],
            ),
        )

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception):
        # Traceback goes to the log with the request id; the client gets nothing
        # internal. The user can quote the id from the toast and we find the line.
        logger.exception(
            "Unhandled error [request_id=%s]", getattr(request.state, "request_id", None)
        )
        return JSONResponse(
            status_code=500,
            content=_error_body(
                request, "An unexpected error occurred", "internal_error"
            ),
        )


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.PROJECT_NAME,
        version="1.0.0",
        # Docs stay on in development so the API is browsable while building.
        docs_url=None if settings.is_production else "/api/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else f"{settings.API_V1_PREFIX}/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        # An explicit list, never ["*"]: browsers reject wildcard origins when
        # credentials are allowed, and we need credentials for the refresh cookie.
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )
    app.add_middleware(AccessLogMiddleware)
    app.add_middleware(RequestIDMiddleware)

    register_exception_handlers(app)

    @app.get("/health", tags=["ops"], summary="Liveness and database check")
    def health() -> dict:
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            db_ok = True
        except Exception:
            logger.exception("Health check: database unreachable")
            db_ok = False
        return {
            "status": "ok" if db_ok else "degraded",
            "database": "up" if db_ok else "down",
            "environment": settings.ENVIRONMENT,
            "version": app.version,
        }

    return app


app = create_app()
