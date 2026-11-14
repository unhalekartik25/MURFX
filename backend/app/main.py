"""FastAPI application entrypoint for MURFX / SPHEREx Blink Viewer.

Mounts /api/v1 endpoints and the static frontend directory.
"""

from __future__ import annotations

from pathlib import Path
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.app.api import router as api_router
from backend.app.config import settings
from backend.app.errors import (
    AppError,
    app_error_handler,
    generic_exception_handler,
    http_exception_handler,
    validation_error_handler,
)
from backend.app.security import RequestIdMiddleware, SecurityHeadersMiddleware


def create_app() -> FastAPI:
    """Create and configure the FastAPI application instance."""
    app = FastAPI(
        title="SPHEREx Wise-Cube & Blink Explorer API",
        version=settings.app_version,
        docs_url="/docs" if settings.enable_docs else None,
        redoc_url=None,
        openapi_url="/openapi.json",
    )

    # 1. Request ID tracking middleware
    app.add_middleware(RequestIdMiddleware)

    # 2. Web security headers middleware (CSP, nosniff, etc.)
    app.add_middleware(SecurityHeadersMiddleware)

    # 3. CORS: public read-only API (GET, POST only, no credentials)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )

    # 4. Standardized exception handlers
    app.add_exception_handler(AppError, app_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, validation_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, generic_exception_handler)

    # 5. API router
    app.include_router(api_router)

    # 6. Static frontend mount
    frontend_path = Path(settings.frontend_dir)
    if not frontend_path.is_absolute():
        frontend_path = Path(__file__).resolve().parent.parent.parent / frontend_path

    if frontend_path.exists():
        app.mount("/", StaticFiles(directory=str(frontend_path), html=True), name="frontend")

    return app


app = create_app()
