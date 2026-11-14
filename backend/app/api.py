"""API routes for MURFX / SPHEREx Blink Viewer.

Base path: /api/v1
Specification: docs/API_SPEC.md.
"""

from __future__ import annotations

import time
from typing import Any
import httpx
from fastapi import APIRouter, Query, Request, Response, status

from backend.app.config import DETECTOR_METADATA, settings
from backend.app.errors import AppError
from backend.app.security import deep_health_limiter, get_client_ip

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

        # Ping IRSA TAP
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
        "latest_observation_mjd": None,
        "latest_observation_iso": None,
        "attribution": settings.attribution,
    }
