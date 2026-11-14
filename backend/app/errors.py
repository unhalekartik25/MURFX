"""Standard error envelope, custom exceptions, and exception handlers.

Specification: docs/API_SPEC.md section 8.
Format: {"error": {"code": "...", "message": "...", "request_id": "..."}}
"""

from __future__ import annotations

import logging
from typing import Any
from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("spherex.errors")


class AppError(Exception):
    """Base application exception mapping to the standard error envelope."""

    def __init__(
        self,
        code: str,
        http_status: int,
        message: str,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.http_status = http_status
        self.message = message
        self.headers = headers or {}


def get_request_id(request: Request) -> str:
    """Retrieve request ID set by the request-id middleware or state."""
    return getattr(request.state, "request_id", "unknown")


def make_error_response(
    code: str,
    message: str,
    http_status: int,
    request_id: str,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    """Build the standard error response envelope."""
    content = {
        "error": {
            "code": code,
            "message": message,
            "request_id": request_id,
        }
    }
    return JSONResponse(
        status_code=http_status,
        content=content,
        headers=headers,
    )


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """Handle custom AppError exceptions."""
    req_id = get_request_id(request)
    logger.warning("AppError [%s] %s: %s (req_id=%s)", exc.code, exc.http_status, exc.message, req_id)
    return make_error_response(
        code=exc.code,
        message=exc.message,
        http_status=exc.http_status,
        request_id=req_id,
        headers=exc.headers,
    )


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Handle FastAPI / pydantic validation errors."""
    req_id = get_request_id(request)
    # Simplify error message to avoid leaking raw input or complex schemas
    errors = exc.errors()
    if errors:
        first = errors[0]
        field_name = " -> ".join(str(loc) for loc in first.get("loc", []) if loc != "body")
        msg = first.get("msg", "Invalid value")
        clean_msg = f"Invalid parameter '{field_name}': {msg}" if field_name else msg
    else:
        clean_msg = "Request validation failed"

    return make_error_response(
        code="INVALID_PARAMETER",
        message=clean_msg,
        http_status=status.HTTP_422_UNPROCESSABLE_ENTITY,
        request_id=req_id,
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Handle Starlette / FastAPI HTTPExceptions."""
    req_id = get_request_id(request)
    if exc.status_code == status.HTTP_404_NOT_FOUND:
        code = "NOT_FOUND"
        message = "Resource not found"
    elif exc.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
        code = "RATE_LIMITED"
        message = "Rate limit exceeded. Please wait before retrying."
    elif exc.status_code == status.HTTP_503_SERVICE_UNAVAILABLE:
        code = "BUSY"
        message = "Server is busy. Please retry shortly."
    else:
        code = "INTERNAL" if exc.status_code >= 500 else "ERROR"
        message = str(exc.detail) if exc.detail else "An error occurred"

    headers = getattr(exc, "headers", None)
    return make_error_response(
        code=code,
        message=message,
        http_status=exc.status_code,
        request_id=req_id,
        headers=headers,
    )


async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle any unexpected internal exceptions without leaking stack traces or internal paths."""
    req_id = get_request_id(request)
    logger.exception("Unhandled exception (req_id=%s): %s", req_id, exc)
    return make_error_response(
        code="INTERNAL",
        message="An unexpected server error occurred. Please try again later.",
        http_status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        request_id=req_id,
    )
