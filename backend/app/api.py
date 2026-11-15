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
from backend.app.catalogs import query_cadc_neossat, query_gaia, query_wise
from backend.app.config import DETECTOR_METADATA, settings
from backend.app.errors import AppError
from backend.app.jobs import job_registry
from backend.app.render import render_animation_gif, render_difference_png
from backend.app.resolver import resolve_object_name
from backend.app.schemas import (
    CandidateFinding,
    SequenceRequest,
    SequenceStatus,
    SpectrumPoint,
    SpectrumResult,
)
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


@router.get("/releases", tags=["system"])
async def list_releases(response: Response) -> dict[str, Any]:
    """Pluggable SPHEREx Data Release manifest adapter per NASA Space Apps Consideration 1.

    Returns schema-validated release manifests for DR1, DR2, IRSA SIA/TAP, and Custom Upload.
    Cache-Control: public, max-age=3600
    """
    response.headers["Cache-Control"] = "public, max-age=3600"
    return {
        "active_release": "dr1",
        "releases": [
            {
                "id": "dr1",
                "name": "SPHEREx Quick-Release DR1 (May–Nov 2025)",
                "status": "PUBLIC_AVAILABLE",
                "coverage": "All-Sky Pass 1 (0.75–5.00 µm)",
                "time_window": "2025-05-01 to 2025-11-01 · MJD 60800–60982",
                "pipeline_version": "v1.2-dr1-cal",
                "channels_per_band": 17,
                "total_channels": 102,
                "pixel_scale_arcsec": 6.15,
                "is_live": True,
                "access_protocol": "local",
                "survey_passes": ["Pass 1 (MJD 60800.0)"],
            },
            {
                "id": "dr2",
                "name": "SPHEREx All-Sky DR2 (Nov 2025–May 2026)",
                "status": "SCHEDULED_RELEASE",
                "coverage": "All-Sky Passes 1 & 2 (Δt = 6 mo Baseline)",
                "time_window": "2025-05-01 to 2026-05-01 · MJD 60800–61165",
                "pipeline_version": "v2.0-dr2-pm",
                "channels_per_band": 17,
                "total_channels": 102,
                "pixel_scale_arcsec": 6.15,
                "is_live": False,
                "access_protocol": "local",
                "survey_passes": ["Pass 1 (MJD 60800.0)", "Pass 2 (MJD 60982.5)"],
            },
            {
                "id": "irsa_live",
                "name": "IRSA SIA/TAP Live Query (IPAC Caltech)",
                "status": "LIVE_REMOTE",
                "coverage": "Direct SIAv2 / TAP ADQL Query Engine",
                "time_window": "Dynamic Live Mission Operations",
                "pipeline_version": "irsa-tap-adql-2.0",
                "channels_per_band": 17,
                "total_channels": 102,
                "pixel_scale_arcsec": 6.15,
                "is_live": True,
                "access_protocol": "tap_sia",
                "endpoint": "https://irsa.ipac.caltech.edu/TAP",
                "survey_passes": ["Live Mission Cadence"],
            },
            {
                "id": "custom",
                "name": "Drop Custom FITS / JSON Cube",
                "status": "CLIENT_UPLOAD",
                "coverage": "User Cutout / Science Verification Product",
                "time_window": "User Defined Epochs",
                "pipeline_version": "client-fits-parser-1.0",
                "channels_per_band": 17,
                "total_channels": 102,
                "pixel_scale_arcsec": 6.15,
                "is_live": True,
                "access_protocol": "custom_drop",
                "survey_passes": ["Custom Multi-Epoch"],
            },
        ],
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


@router.get("/catalog/gaia", tags=["catalogs"])
async def catalog_gaia(
    response: Response,
    ra: float = Query(..., ge=0.0, lt=360.0, description="Center Right Ascension in degrees"),
    dec: float = Query(..., ge=-90.0, le=90.0, description="Center Declination in degrees"),
    radius_arcmin: float = Query(default=8.0, ge=0.5, le=20.0, description="Search radius in arcminutes"),
) -> dict[str, Any]:
    """Query Gaia DR3 sources with proper motion per docs/API_SPEC.md section 3.7.

    Returns up to 500 sources. Cache-Control: public, max-age=86400.
    """
    response.headers["Cache-Control"] = "public, max-age=86400"
    return query_gaia(ra, dec, radius_arcmin)


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


@router.get("/spectrum", tags=["spectrum"])
async def get_pixel_spectrum(
    key: str = Query(..., description="32-character hex sequence key"),
    x: float = Query(..., ge=0.0, description="Grid pixel X coordinate"),
    y: float = Query(..., ge=0.0, description="Grid pixel Y coordinate"),
    radius_px: int = Query(1, ge=1, le=5, description="Aperture radius in pixels (1-5)"),
) -> JSONResponse:
    """Extract spectral energy distribution at (x, y) per docs/API_SPEC.md section 3.8."""
    if not SEQUENCE_KEY_REGEX.match(key):
        raise AppError("NOT_FOUND", 404, "Invalid sequence key.")

    meta = disk_cache.get_sequence_meta(key)
    if not meta:
        raise AppError("NOT_FOUND", 404, f"Sequence key '{key}' not found.")

    grid = meta.get("grid", {})
    w = grid.get("width", 0)
    h = grid.get("height", 0)
    if w <= 0 or h <= 0 or x >= w or y >= h:
        raise AppError(
            "INVALID_PARAMETER",
            422,
            f"Pixel coordinates (x={x}, y={y}) out of grid bounds ({w}x{h}).",
        )

    cube = disk_cache.get_sequence_cube(key)
    if cube is None:
        raise AppError(
            "NOT_FOUND",
            404,
            f"Spectral cube data not retained for sequence {key}.",
        )

    data = cube["data"]  # shape (N, H, W)
    var = cube["var"]    # shape (N, H, W)
    wavelengths = cube["wavelengths"]
    mjds = cube["mjds"]
    detectors = cube["detectors"]

    import numpy as np

    n_frames, cube_h, cube_w = data.shape
    row = int(round(y))
    col = int(round(x))

    row = max(0, min(cube_h - 1, row))
    col = max(0, min(cube_w - 1, col))

    points: list[SpectrumPoint] = []

    # Circular aperture
    r_sq = radius_px * radius_px
    rmin = max(0, row - radius_px)
    rmax = min(cube_h, row + radius_px + 1)
    cmin = max(0, col - radius_px)
    cmax = min(cube_w, col + radius_px + 1)

    rr, cc = np.ogrid[rmin:rmax, cmin:cmax]
    circle_mask = (rr - row) ** 2 + (cc - col) ** 2 <= r_sq

    for i in range(n_frames):
        sub_data = data[i, rmin:rmax, cmin:cmax]
        sub_var = var[i, rmin:rmax, cmin:cmax]

        valid = circle_mask & np.isfinite(sub_data)
        if not np.any(valid):
            continue

        valid_data = sub_data[valid]
        flux = float(np.mean(valid_data))

        valid_var = sub_var[valid]
        if np.any(np.isfinite(valid_var)):
            finite_var = valid_var[np.isfinite(valid_var)]
            sigma = float(np.sqrt(np.mean(finite_var) / len(finite_var))) if len(finite_var) > 0 else 0.0
        else:
            sigma = 0.0

        wl = float(wavelengths[i]) if i < len(wavelengths) else 0.0
        mjd = float(mjds[i]) if i < len(mjds) else 0.0
        det = int(detectors[i]) if i < len(detectors) else 1

        points.append(
            SpectrumPoint(
                wavelength_um=round(wl, 4),
                flux_mjy_sr=round(flux, 4),
                sigma=round(sigma, 4),
                mjd=round(mjd, 4),
                detector=det,
            )
        )

    # Sort points by wavelength ascending
    points.sort(key=lambda pt: pt.wavelength_um)

    res = SpectrumResult(
        key=key,
        x=round(x, 2),
        y=round(y, 2),
        radius_px=radius_px,
        n_points=len(points),
        points=points,
    )

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=res.model_dump(),
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.get("/sequences/{key}/difference.png", tags=["sequences"])
async def get_sequence_difference(
    request: Request,
    key: str = FPath(..., description="32-character hex sequence key"),
    frame_a: int = Query(..., ge=0, description="0-based reference frame index A"),
    frame_b: int = Query(..., ge=0, description="0-based comparison frame index B"),
    colormap: str = Query(default="grayscale", description="Difference colormap: 'grayscale' or 'diverging'"),
) -> FileResponse:
    """Serve image subtraction (difference) PNG between frame_b and frame_a (Slice 7).

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

    # Check cached difference PNG if standard grayscale
    if colormap == "grayscale":
        cached_diff = disk_cache.get_frame_difference_path(key, frame_a, frame_b)
        if cached_diff and cached_diff.exists():
            return FileResponse(
                path=str(cached_diff),
                media_type="image/png",
                headers={
                    "Cache-Control": "public, max-age=86400, immutable",
                    "X-Content-Type-Options": "nosniff",
                },
            )

    meta = disk_cache.get_sequence_meta(key)
    if not meta:
        raise AppError("NOT_FOUND", 404, f"Sequence key '{key}' not found.")

    frames_list = meta.get("frames", [])
    if frame_a >= len(frames_list) or frame_b >= len(frames_list):
        raise AppError(
            "INVALID_PARAMETER",
            422,
            f"Frame indices ({frame_a}, {frame_b}) exceed sequence frame count ({len(frames_list)}).",
        )

    import numpy as np

    # Route 1: Compute from spectral cube if available (scientific flux difference)
    cube = disk_cache.get_sequence_cube(key)
    if cube is not None:
        data = cube["data"]  # shape (N, H, W)
        if frame_a < data.shape[0] and frame_b < data.shape[0]:
            diff_arr = data[frame_b] - data[frame_a]
            valid = np.isfinite(data[frame_b]) & np.isfinite(data[frame_a])
            png_bytes = render_difference_png(diff_arr, valid, already_flipped=True, colormap=colormap)
            if colormap == "grayscale":
                diff_path = disk_cache.put_frame_difference_png(key, frame_a, frame_b, png_bytes)
                return FileResponse(
                    path=str(diff_path),
                    media_type="image/png",
                    headers={
                        "Cache-Control": "public, max-age=86400, immutable",
                        "X-Content-Type-Options": "nosniff",
                    },
                )
            else:
                return Response(
                    content=png_bytes,
                    media_type="image/png",
                    headers={
                        "Cache-Control": "public, max-age=86400, immutable",
                        "X-Content-Type-Options": "nosniff",
                    },
                )

    # Route 2: Compute difference directly from rendered PNG frames (fallback)
    path_a = disk_cache.get_frame_png_path(key, frame_a)
    path_b = disk_cache.get_frame_png_path(key, frame_b)
    if not path_a or not path_a.exists() or not path_b or not path_b.exists():
        raise AppError("NOT_FOUND", 404, "One or both target frames are missing.")

    from PIL import Image

    img_a = Image.open(path_a).convert("LA")
    img_b = Image.open(path_b).convert("LA")

    arr_a = np.array(img_a)
    arr_b = np.array(img_b)

    gray_a = arr_a[:, :, 0].astype(np.float32)
    gray_b = arr_b[:, :, 0].astype(np.float32)
    alpha_a = arr_a[:, :, 1] > 0
    alpha_b = arr_b[:, :, 1] > 0

    diff_arr = gray_b - gray_a
    valid = alpha_a & alpha_b
    png_bytes = render_difference_png(diff_arr, valid, already_flipped=True, colormap=colormap)
    if colormap == "grayscale":
        diff_path = disk_cache.put_frame_difference_png(key, frame_a, frame_b, png_bytes)
        return FileResponse(
            path=str(diff_path),
            media_type="image/png",
            headers={
                "Cache-Control": "public, max-age=86400, immutable",
                "X-Content-Type-Options": "nosniff",
            },
        )

    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={
            "Cache-Control": "public, max-age=86400, immutable",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/sequences/{key}/arithmetic.png", tags=["sequences"])
async def get_sequence_arithmetic_image(
    key: str = FPath(..., description="32-character hex sequence key"),
    op: str = Query(default="diff", regex="^(diff|sum|median)$", description="Arithmetic operator: diff, sum, median"),
    frame_a: int = Query(default=0, ge=0, description="Reference Frame A index"),
    frame_b: int = Query(default=1, ge=0, description="Comparison Frame B index"),
    colormap: str = Query(default="diverging", regex="^(diverging|grayscale)$"),
) -> Response:
    """Temporal Image Arithmetic endpoint per NASA Space Apps Consideration 3.
    
    Supports:
      - 'diff' (B - A): Diverging blue/amber dipole showing proper motion and transients
      - 'sum' (A + B): Epoch co-add boosting faint static galaxies while smearing moving objects
      - 'median': Multi-epoch median stack rejecting cosmic rays and moving asteroids
    """
    if not SEQUENCE_KEY_REGEX.match(key):
        raise AppError("NOT_FOUND", 404, "Invalid sequence key.")

    from PIL import Image

    if op == "median":
        # Load all available frame PNGs for key
        png_paths = []
        for i in range(30):
            p = disk_cache.get_frame_png_path(key, i)
            if p and p.exists():
                png_paths.append(p)
            else:
                break
        if not png_paths:
            raise AppError("NOT_FOUND", 404, "No frames available for median stack.")

        arrays = []
        for p in png_paths:
            img = Image.open(p).convert("LA")
            arr = np.array(img)[:, :, 0].astype(np.float32)
            arrays.append(arr)

        stack = np.stack(arrays, axis=0)
        med = np.median(stack, axis=0)
        # Render median stack
        med_u8 = np.clip(med, 0, 255).astype(np.uint8)
        alpha = np.full_like(med_u8, 255)
        out_img = Image.fromarray(np.stack([med_u8, alpha], axis=-1), mode="LA")
        import io
        buf = io.BytesIO()
        out_img.save(buf, format="PNG")
        return Response(content=buf.getvalue(), media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})

    path_a = disk_cache.get_frame_png_path(key, frame_a)
    path_b = disk_cache.get_frame_png_path(key, frame_b)
    if not path_a or not path_a.exists() or not path_b or not path_b.exists():
        raise AppError("NOT_FOUND", 404, "One or both target frames are missing.")

    img_a = Image.open(path_a).convert("LA")
    img_b = Image.open(path_b).convert("LA")
    arr_a = np.array(img_a)
    arr_b = np.array(img_b)
    gray_a = arr_a[:, :, 0].astype(np.float32)
    gray_b = arr_b[:, :, 0].astype(np.float32)
    valid = (arr_a[:, :, 1] > 0) & (arr_b[:, :, 1] > 0)

    if op == "sum":
        coadd = 0.5 * (gray_a + gray_b)
        coadd_u8 = np.clip(coadd, 0, 255).astype(np.uint8)
        alpha = np.where(valid, 255, 0).astype(np.uint8)
        out_img = Image.fromarray(np.stack([coadd_u8, alpha], axis=-1), mode="LA")
        import io
        buf = io.BytesIO()
        out_img.save(buf, format="PNG")
        return Response(content=buf.getvalue(), media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})

    # op == "diff"
    diff_arr = gray_b - gray_a
    png_bytes = render_difference_png(diff_arr, valid, already_flipped=True, colormap=colormap)
    return Response(content=png_bytes, media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})


@router.get("/catalog/neossat", tags=["catalogs"])
async def get_neossat_catalog(
    ra: float = Query(..., ge=0.0, lt=360.0, description="Right Ascension in ICRS degrees"),
    dec: float = Query(..., ge=-90.0, le=90.0, description="Declination in ICRS degrees"),
    radius_arcmin: float = Query(default=8.0, ge=0.5, le=30.0, description="Search radius in arcmin"),
) -> JSONResponse:
    """Query CADC NEOSSat observations for moving asteroid/debris cross-matching (Slice 7)."""
    data = query_cadc_neossat(ra, dec, radius_arcmin)
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=data,
        headers={"Cache-Control": "public, max-age=86400"},
    )



@router.get("/sequences/{key}/export.gif", tags=["sequences"])
async def export_sequence_gif(
    request: Request,
    key: str = FPath(..., description="32-character hex sequence key"),
    fps: int = Query(default=4, ge=1, le=15, description="Playback frames per second (1 to 15)"),
) -> FileResponse:
    """Export the sequence as an animated GIF for sharing and presentations (Slice 8).

    Cache-Control: public, max-age=86400
    """
    if not SEQUENCE_KEY_REGEX.match(key):
        raise AppError("NOT_FOUND", 404, "Invalid sequence key.")

    client_ip = get_client_ip(request)
    allowed, retry_after = frames_limiter.consume(client_ip)
    if not allowed:
        raise AppError(
            code="RATE_LIMITED",
            http_status=status.HTTP_429_TOO_MANY_REQUESTS,
            message="Export rate limit exceeded.",
            headers={"Retry-After": str(int(retry_after))},
        )

    # Check cached animated GIF
    cached_gif = disk_cache.get_sequence_gif_path(key, fps)
    if cached_gif and cached_gif.exists():
        return FileResponse(
            path=str(cached_gif),
            media_type="image/gif",
            headers={
                "Cache-Control": "public, max-age=86400",
                "Content-Disposition": f'attachment; filename="spherex_{key[:8]}_{fps}fps.gif"',
            },
        )

    meta = disk_cache.get_sequence_meta(key)
    if not meta:
        raise AppError("NOT_FOUND", 404, f"Sequence key '{key}' not found.")

    frames_list = meta.get("frames", [])
    if not frames_list:
        raise AppError("NOT_FOUND", 404, f"No frames available for sequence {key}.")

    png_bytes_list: list[bytes] = []
    for idx in range(len(frames_list)):
        p = disk_cache.get_frame_png_path(key, idx)
        if p and p.exists():
            png_bytes_list.append(p.read_bytes())

    if not png_bytes_list:
        raise AppError("NOT_FOUND", 404, "Rendered frames missing from cache.")

    gif_bytes = render_animation_gif(png_bytes_list, fps=fps)
    gif_path = disk_cache.put_sequence_gif(key, fps, gif_bytes)

    return FileResponse(
        path=str(gif_path),
        media_type="image/gif",
        headers={
            "Cache-Control": "public, max-age=86400",
            "Content-Disposition": f'attachment; filename="spherex_{key[:8]}_{fps}fps.gif"',
        },
    )


@router.get("/catalog/wise", tags=["catalogs"])
async def get_wise_catalog(
    ra: float = Query(..., ge=0.0, lt=360.0, description="Right Ascension in ICRS degrees"),
    dec: float = Query(..., ge=-90.0, le=90.0, description="Declination in ICRS degrees"),
    radius_arcmin: float = Query(default=6.0, ge=0.5, le=20.0, description="Search radius in arcmin"),
) -> JSONResponse:
    """Query AllWISE (2010) infrared catalog sources for 15-year epoch baseline comparison (Slice 8)."""
    data = query_wise(ra, dec, radius_arcmin)
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=data,
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.get("/sequences/{key}/stack.fits", tags=["sequences"])
async def export_sequence_fits(
    request: Request,
    key: str = FPath(..., description="32-character hex sequence key"),
) -> FileResponse:
    """Export the sequence as a calibrated scientific FITS image with WCS (Slice 9).

    Cache-Control: public, max-age=86400
    """
    if not SEQUENCE_KEY_REGEX.match(key):
        raise AppError("NOT_FOUND", 404, "Invalid sequence key.")

    client_ip = get_client_ip(request)
    allowed, retry_after = frames_limiter.consume(client_ip)
    if not allowed:
        raise AppError(
            code="RATE_LIMITED",
            http_status=status.HTTP_429_TOO_MANY_REQUESTS,
            message="Export rate limit exceeded.",
            headers={"Retry-After": str(int(retry_after))},
        )

    # Check cached FITS file
    cached_fits = disk_cache.get_sequence_fits_path(key)
    if cached_fits and cached_fits.exists():
        return FileResponse(
            path=str(cached_fits),
            media_type="application/fits",
            headers={
                "Cache-Control": "public, max-age=86400",
                "Content-Disposition": f'attachment; filename="spherex_{key[:8]}_stack.fits"',
            },
        )

    meta = disk_cache.get_sequence_meta(key)
    if not meta:
        raise AppError("NOT_FOUND", 404, f"Sequence key '{key}' not found.")

    import io
    import numpy as np
    from astropy.io import fits
    from astropy.wcs import WCS

    grid_meta = meta.get("grid", {})
    wcs_dict = grid_meta.get("wcs", {})
    w = grid_meta.get("width", 20)
    h = grid_meta.get("height", 20)

    cube = disk_cache.get_sequence_cube(key)
    if cube is not None:
        data = cube["data"]  # shape (N, H, W)
        stacked = np.nanmean(data, axis=0)
        fits_data = np.flipud(stacked)  # Row 0 South for FITS
    else:
        fits_data = np.zeros((h, w), dtype=np.float32)

    wcs_obj = WCS(naxis=2)
    wcs_obj.wcs.ctype = wcs_dict.get("ctype", ["RA---TAN", "DEC--TAN"])
    wcs_obj.wcs.crval = wcs_dict.get("crval", [meta.get("request", {}).get("ra", 0.0), meta.get("request", {}).get("dec", 0.0)])
    wcs_obj.wcs.crpix = wcs_dict.get("crpix", [w / 2.0, h / 2.0])
    wcs_obj.wcs.cdelt = wcs_dict.get("cdelt_deg", [-0.000856, 0.000856])

    header = wcs_obj.to_header()
    header["BUNIT"] = ("MJy/sr", "Surface brightness")
    header["CREATOR"] = ("MURFX SPHEREx Explorer", "NASA Space Apps 2026")
    header["TELESCOP"] = ("SPHEREx", "NASA SPHEREx Mission")
    header["SEQ_KEY"] = (key, "Sequence Hash")
    header["NFRAMES"] = (len(meta.get("frames", [])), "Number of frames")

    hdu = fits.PrimaryHDU(data=fits_data.astype(np.float32), header=header)
    bio = io.BytesIO()
    hdu.writeto(bio)
    fits_bytes = bio.getvalue()
    fits_path = disk_cache.put_sequence_fits(key, fits_bytes)

    return FileResponse(
        path=str(fits_path),
        media_type="application/fits",
        headers={
            "Cache-Control": "public, max-age=86400",
            "Content-Disposition": f'attachment; filename="spherex_{key[:8]}_stack.fits"',
        },
    )


@router.post("/candidates", status_code=status.HTTP_201_CREATED, tags=["candidates"])
async def create_candidate(finding: CandidateFinding) -> dict[str, Any]:
    """Log a citizen science candidate or moving object finding (Slice 10)."""
    import datetime

    finding_dict = finding.model_dump()
    if not finding_dict.get("created_at"):
        finding_dict["created_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    saved = disk_cache.save_candidate(finding_dict)
    return saved


@router.get("/candidates", tags=["candidates"])
async def list_candidates(sequence_key: str | None = Query(default=None, description="Filter by sequence hash")) -> list[dict[str, Any]]:
    """List citizen science discovery findings (Slice 10)."""
    return disk_cache.get_candidates(sequence_key=sequence_key)


@router.get("/candidates/export", tags=["candidates"])
async def export_candidates(
    sequence_key: str | None = Query(default=None, description="Filter by sequence hash"),
) -> Response:
    """Export citizen science discovery findings as downloadable JSON formatted for NASA Space Apps reporting (Slice 11)."""
    import datetime
    import json

    findings = disk_cache.get_candidates(sequence_key=sequence_key)
    export_payload = {
        "project": "MURFX SPHEREx Wise-Cube & Blink Explorer",
        "challenge": "NASA Space Apps Challenge 2026 - Planet X and SPHEREx",
        "exported_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "filter_sequence_key": sequence_key,
        "total_findings": len(findings),
        "findings": findings,
    }
    filename = f"murfx_candidates_{sequence_key[:8]}.json" if sequence_key else "murfx_all_candidates.json"
    return Response(
        content=json.dumps(export_payload, indent=2),
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-cache",
        },
    )

