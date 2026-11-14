"""API routes for MURFX / SPHEREx Blink Viewer.

Base path: /api/v1
Specification: docs/API_SPEC.md.
"""

from __future__ import annotations

import time
from typing import Any
import httpx
from fastapi import APIRouter, Path as FPath, Query, Request, Response, status
from fastapi.responses import FileResponse, JSONResponse

from backend.app.cache import disk_cache
from backend.app.config import DETECTOR_METADATA, settings
from backend.app.errors import AppError
from backend.app.jobs import job_registry
from backend.app.resolver import resolve_object_name
from backend.app.schemas import SequenceRequest, SequenceStatus
from backend.app.security import (
    SEQUENCE_KEY_REGEX,
    create_limiter,
    deep_health_limiter,
    frames_limiter,
    get_client_ip,
    resolve_limiter,
)

router = APIRouter(prefix="/api/v1")

START_TIME = time.monotonic()


@router.get("/health", tags=["system"])
async def health(
    request: Request,
    response: Response,
    deep: int = Query(default=0, ge=0, le=1, description="Deep health check including IRSA TAP ping"),
) -> dict[str, Any]:
    """Health check endpoint per docs/API_SPEC.md section 3.1.

    Cache-Control: no-store
    """
    response.headers["Cache-Control"] = "no-store"
    uptime_s = round(time.monotonic() - START_TIME, 1)

    result: dict[str, Any] = {
        "status": "ok",
        "version": settings.app_version,
        "pipeline_version": settings.pipeline_version,
        "uptime_s": uptime_s,
    }

    if deep == 1:
        client_ip = get_client_ip(request)
        allowed, retry_after = deep_health_limiter.consume(client_ip)
        if not allowed:
            raise AppError(
                code="RATE_LIMITED",
                http_status=status.HTTP_429_TOO_MANY_REQUESTS,
                message="Deep health check rate limit exceeded. Please wait.",
                headers={"Retry-After": str(int(retry_after))},
            )

        irsa_status = "unavailable"
        try:
            async with httpx.AsyncClient(
                timeout=5.0,
                headers={"User-Agent": settings.user_agent},
            ) as client:
                res = await client.get("https://irsa.ipac.caltech.edu/TAP")
                if res.status_code in (200, 301, 302):
                    irsa_status = "ok"
        except Exception:
            irsa_status = "unavailable"

        result["irsa"] = irsa_status

    return result


@router.get("/meta", tags=["system"])
async def meta(response: Response) -> dict[str, Any]:
    """Metadata endpoint per docs/API_SPEC.md section 3.2.

    Cache-Control: public, max-age=60
    """
    response.headers["Cache-Control"] = "public, max-age=60"

    return {
        "pipeline_version": settings.pipeline_version,
        "detectors": DETECTOR_METADATA,
        "limits": {
            "fov_arcmin": [settings.min_fov_arcmin, settings.max_fov_arcmin],
            "max_frames": settings.max_frames_hard,
        },
        "latest_observation_mjd": 60850.5,
        "latest_observation_iso": "2025-07-01T12:00:00Z",
        "attribution": settings.attribution,
    }


@router.get("/resolve", tags=["catalogs"])
async def resolve(
    request: Request,
    response: Response,
    name: str = Query(..., min_length=1, max_length=64, description="Astronomical object name"),
) -> dict[str, Any]:
    """Resolve an object name to coordinates and proper motion per docs/API_SPEC.md section 3.3."""
    client_ip = get_client_ip(request)
    allowed, retry_after = resolve_limiter.consume(client_ip)
    if not allowed:
        raise AppError(
            code="RATE_LIMITED",
            http_status=status.HTTP_429_TOO_MANY_REQUESTS,
            message="Name resolution rate limit exceeded. Please wait.",
            headers={"Retry-After": str(int(retry_after))},
        )

    response.headers["Cache-Control"] = "public, max-age=86400"
    return resolve_object_name(name)


@router.post("/sequences", tags=["sequences"])
async def create_sequence(
    req: SequenceRequest,
    request: Request,
    response: Response,
) -> JSONResponse:
    """Create or retrieve a sequence job per docs/API_SPEC.md section 3.4.

    Returns HTTP 200 if already done; HTTP 202 if queued or running.
    """
    client_ip = get_client_ip(request)

    # Rate limiting on sequence creation (6 req/min per IP)
    allowed, retry_after = create_limiter.consume(client_ip)
    if not allowed:
        raise AppError(
            code="RATE_LIMITED",
            http_status=status.HTTP_429_TOO_MANY_REQUESTS,
            message="Sequence creation rate limit exceeded. Please wait before submitting more requests.",
            headers={"Retry-After": str(int(retry_after))},
        )

    status_obj, is_new = job_registry.submit_sequence(req, client_ip)

    if status_obj.status == "done":
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=status_obj.model_dump(),
            headers={"Cache-Control": "public, max-age=300"},
        )
    else:
        return JSONResponse(
            status_code=status.HTTP_202_ACCEPTED,
            content=status_obj.model_dump(),
            headers={
                "Location": f"/api/v1/sequences/{status_obj.key}",
                "Cache-Control": "no-store",
            },
        )


@router.get("/sequences/{key}", tags=["sequences"])
async def get_sequence_status(
    key: str = FPath(..., description="32-character hex sequence key"),
    response: Response = None,  # type: ignore[assignment]
) -> JSONResponse:
    """Poll sequence status or retrieve result per docs/API_SPEC.md section 3.5."""
    if not SEQUENCE_KEY_REGEX.match(key):
        raise AppError(
            code="NOT_FOUND",
            http_status=status.HTTP_404_NOT_FOUND,
            message=f"Sequence key '{key}' not found or malformed.",
        )

    status_obj = job_registry.get_status(key)
    if not status_obj:
        raise AppError(
            code="NOT_FOUND",
            http_status=status.HTTP_404_NOT_FOUND,
            message=f"Sequence key '{key}' not found.",
        )

    cache_ctrl = "public, max-age=300" if status_obj.status == "done" else "no-store"
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=status_obj.model_dump(),
        headers={"Cache-Control": cache_ctrl},
    )


@router.get("/sequences/{key}/frames/{index}.png", tags=["sequences"])
async def get_sequence_frame(
    request: Request,
    key: str = FPath(..., description="32-character hex sequence key"),
    index: int = FPath(..., ge=0, description="0-based frame index"),
) -> FileResponse:
    """Serve rendered PNG frame per docs/API_SPEC.md section 3.6.

    Cache-Control: public, max-age=86400, immutable
    """
    if not SEQUENCE_KEY_REGEX.match(key):
        raise AppError("NOT_FOUND", 404, "Invalid sequence key.")

    client_ip = get_client_ip(request)
    allowed, retry_after = frames_limiter.consume(client_ip)
    if not allowed:
        raise AppError(
            code="RATE_LIMITED",
            http_status=status.HTTP_429_TOO_MANY_REQUESTS,
            message="Frame retrieval rate limit exceeded.",
            headers={"Retry-After": str(int(retry_after))},
        )

    png_path = disk_cache.get_frame_png_path(key, index)
    if not png_path or not png_path.exists():
        raise AppError("NOT_FOUND", 404, f"Frame {index} for sequence {key} not found.")

    return FileResponse(
        path=str(png_path),
        media_type="image/png",
        headers={
            "Cache-Control": "public, max-age=86400, immutable",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/sequences/{key}/frames/{index}/flags.png", tags=["sequences"])
async def get_sequence_frame_flags(
    request: Request,
    key: str = FPath(..., description="32-character hex sequence key"),
    index: int = FPath(..., ge=0, description="0-based frame index"),
) -> FileResponse:
    """Serve optional bad-pixel mask overlay PNG."""
    if not SEQUENCE_KEY_REGEX.match(key):
        raise AppError("NOT_FOUND", 404, "Invalid sequence key.")

    flags_path = disk_cache.get_frame_flags_path(key, index)
    if not flags_path or not flags_path.exists():
        raise AppError("NOT_FOUND", 404, f"Flags mask {index} for sequence {key} not found.")

    return FileResponse(
        path=str(flags_path),
        media_type="image/png",
        headers={
            "Cache-Control": "public, max-age=86400, immutable",
            "X-Content-Type-Options": "nosniff",
        },
    )
