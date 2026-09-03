"""Domain exceptions.

Services raise these; HTTP handlers translate them. This is what keeps the
service layer free of `fastapi` imports and therefore unit-testable without a
client.
"""
from __future__ import annotations

from typing import Any


class AppException(Exception):
    status_code: int = 500
    code: str = "internal_error"

    def __init__(self, message: str, **context: Any) -> None:
        super().__init__(message)
        self.message = message
        self.context = context


class NotFoundError(AppException):
    status_code = 404
    code = "not_found"


class PermissionDenied(AppException):
    status_code = 403
    code = "forbidden"


class ValidationError(AppException):
    status_code = 422
    code = "validation_error"


class ConflictError(AppException):
    status_code = 409
    code = "conflict"


class InvalidTransition(ConflictError):
    """The request is well-formed but the resource is in the wrong state.

    409 rather than 400 on purpose: the client's correct response is to refetch,
    because a 409 usually means someone else moved the report.
    """

    code = "invalid_transition"


class AuthenticationError(AppException):
    status_code = 401
    code = "unauthenticated"
