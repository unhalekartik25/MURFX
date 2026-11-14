"""End-to-end sequence processing pipeline.

Specification: docs/ARCHITECTURE.md section 5.
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Callable
import httpx
import numpy as np
from astropy.time import Time

from backend.app.cache import disk_cache
from backend.app.config import settings
from backend.app.cutouts import Cutout, download_cutout, parse_cutout
from backend.app.errors import AppError
from backend.app.irsa import ImageRef, query_images
from backend.app.processing import (
    ProcessedFrame,
    build_target_grid,
    compute_center_value,
    mask_flags,
    reproject_frame,
    stack_time_bins,
    stretch_frames,
    subtract_background,
)
from backend.app.render import render_to_png_bytes
from backend.app.schemas import (
    FrameInfo,
    GridInfo,
    SequenceRequest,
    SequenceResult,
    StretchInfo,
)

logger = logging.getLogger("spherex.pipeline")


def subsample_evenly(items: list[ImageRef], limit: int) -> list[ImageRef]:
    """Subsample list evenly across time, guaranteeing first and last items are preserved."""
    if len(items) <= limit:
        return items
    indices = np.round(np.linspace(0, len(items) - 1, limit)).astype(int)
    return [items[i] for i in indices]


def run_sequence(
    req: SequenceRequest,
    key: str,
    progress_cb: Callable[[str, int, int], None] | None = None,
) -> SequenceResult:
    """Execute the sequence pipeline from query to rendered PNG frames."""
    warnings: list[str] = []

    # Stage 1: Query IRSA TAP
    if progress_cb:
        progress_cb("query", 0, 1)

    images = query_images(req.ra, req.dec, req.detector, req.fov_arcmin)
    n_available = len(images)
    truncated = False

    # Stage 2: Subsample images if exceeding max_frames
    if progress_cb:
        progress_cb("select", 0, 1)

    if n_available > req.max_frames:
        truncated = True
        selected_images = subsample_evenly(images, req.max_frames)
        warnings.append(
            f"Exposures truncated from {n_available} to {req.max_frames} per request limit."
        )
    else:
        selected_images = images

    # Stage 3: Download cutouts with bounded concurrency
    if progress_cb:
        progress_cb("download", 0, len(selected_images))

    raw_data_map: dict[str, bytes] = {}
    failed_downloads = 0

    with httpx.Client(
        timeout=settings.cutout_timeout_s,
        follow_redirects=False,
        headers={"User-Agent": settings.user_agent},
    ) as client:
        # Download cutouts
        for idx, img_ref in enumerate(selected_images):
            data = download_cutout(img_ref.url, client=client)
            if data is not None:
                raw_data_map[img_ref.url] = data
            else:
                failed_downloads += 1
            if progress_cb:
                progress_cb("download", idx + 1, len(selected_images))

    if failed_downloads > 0:
        warnings.append(f"{failed_downloads} cutouts failed to download and were skipped.")

    if len(raw_data_map) < 2:
        raise AppError(
            "UPSTREAM_UNAVAILABLE",
            502,
            f"Insufficient valid cutouts downloaded ({len(raw_data_map)} received, minimum 2 required).",
        )

    # Stage 4: Defensive Parsing
    if progress_cb:
        progress_cb("parse", 0, len(raw_data_map))

    parsed_cutouts: list[Cutout] = []
    for idx, img_ref in enumerate(selected_images):
        raw_bytes = raw_data_map.get(img_ref.url)
        if raw_bytes is None:
            continue
        cutout = parse_cutout(raw_bytes, img_ref, req.detector, req.ra, req.dec)
        if cutout is not None:
            parsed_cutouts.append(cutout)
        if progress_cb:
            progress_cb("parse", idx + 1, len(selected_images))

    if len(parsed_cutouts) < 2:
        raise AppError(
            "UPSTREAM_UNAVAILABLE",
            502,
            "Too few valid FITS files could be parsed successfully.",
        )

    # Stage 5: Target Grid & Reprojection
    if progress_cb:
        progress_cb("process", 0, len(parsed_cutouts))

    # Read native pixel scale from first valid cutout WCS
    first_wcs = parsed_cutouts[0].wcs
    try:
        from astropy.wcs.utils import proj_plane_pixel_scales
        scales = proj_plane_pixel_scales(first_wcs)
        native_pixscale_arcsec = float(np.mean(scales)) * 3600.0
    except Exception:
        native_pixscale_arcsec = 6.2

    grid_wcs, grid_w, grid_h, pixscale_arcsec, effective_upsample = build_target_grid(
        ra=req.ra,
        dec=req.dec,
        fov_arcmin=req.fov_arcmin,
        native_pixscale_arcsec=native_pixscale_arcsec,
        upsample=req.upsample,
        max_grid_px=settings.max_grid_px,
    )

    reprojected_frames: list[ProcessedFrame] = []
    for idx, cutout in enumerate(parsed_cutouts):
        # 5a. Clean: Mask unusable flags and subtract background
        cleaned_image, flag_fraction = mask_flags(cutout.image, cutout.flags, req.mask_level)
        bg_subtracted = subtract_background(cleaned_image, cutout.zodi, req.background)

        # 5b. Reproject onto common grid
        grid_data = reproject_frame(
            data=bg_subtracted,
            data_wcs=cutout.wcs,
            grid_wcs=grid_wcs,
            shape_out=(grid_h, grid_w),
        )

        center_val = compute_center_value(grid_data)

        reprojected_frames.append(
            ProcessedFrame(
                data=grid_data,
                mjd=cutout.ref.mjd,
                wavelength_um=cutout.wavelength_um,
                detector=cutout.detector,
                n_exposures=1,
                obs_id=cutout.obs_id,
                obs_ids=None,
                version=cutout.version,
                flag_fraction=flag_fraction,
                center_value=center_val,
            )
        )

        # Memory hygiene: clear parsed cutout data immediately
        del cutout.image, cutout.flags, cutout.variance, cutout.zodi

        if progress_cb:
            progress_cb("process", idx + 1, len(parsed_cutouts))

    # 5c. Time bin stacking if mode="stack"
    if req.mode == "stack":
        processed_frames = stack_time_bins(reprojected_frames, req.bin_days)
    else:
        processed_frames = reprojected_frames

    # Sort frames chronologically
    processed_frames.sort(key=lambda f: f.mjd)

    # Stage 6: Stretch & Render PNG frames
    if progress_cb:
        progress_cb("render", 0, len(processed_frames))

    uint8_images, vmin, vmax = stretch_frames(processed_frames, stretch_mode=req.stretch)

    frame_infos: list[FrameInfo] = []
    for i, (pf, arr_uint8) in enumerate(zip(processed_frames, uint8_images)):
        valid_mask = np.isfinite(pf.data)
        png_bytes = render_to_png_bytes(arr_uint8, valid_mask)
        disk_cache.put_frame_png(key, i, png_bytes)

        # Convert MJD to ISO string
        try:
            iso_str = Time(pf.mjd, format="mjd", scale="utc").isot + "Z"
        except Exception:
            iso_str = datetime.now(timezone.utc).isoformat()

        frame_infos.append(
            FrameInfo(
                index=i,
                url=f"/api/v1/sequences/{key}/frames/{i}.png",
                mjd=round(pf.mjd, 4),
                iso=iso_str,
                wavelength_um=pf.wavelength_um,
                detector=pf.detector,
                n_exposures=pf.n_exposures,
                obs_id=pf.obs_id,
                obs_ids=pf.obs_ids,
                version=pf.version,
                flag_fraction=pf.flag_fraction,
                center_value=pf.center_value,
            )
        )

        if progress_cb:
            progress_cb("render", i + 1, len(processed_frames))

    # WCS representation for API result
    wcs_dict = {
        "ctype": list(grid_wcs.wcs.ctype),
        "crval": [round(float(v), 6) for v in grid_wcs.wcs.crval],
        "crpix": [round(float(v), 1) for v in grid_wcs.wcs.crpix],
        "cdelt_deg": [round(float(v), 8) for v in grid_wcs.wcs.cdelt],
    }

    result = SequenceResult(
        n_frames=len(frame_infos),
        n_available=n_available,
        truncated=truncated,
        n_failed_downloads=failed_downloads,
        grid=GridInfo(
            width=grid_w,
            height=grid_h,
            pixscale_arcsec=pixscale_arcsec,
            native_pixscale_arcsec=round(native_pixscale_arcsec, 2),
            upsample=int(effective_upsample),
            orientation="north-up, east-left, row 0 = north",
            wcs=wcs_dict,
        ),
        stretch=StretchInfo(
            mode=req.stretch,
            function="asinh",
            vmin=vmin,
            vmax=vmax,
            unit="MJy/sr",
        ),
        frames=frame_infos,
        warnings=warnings,
    )

    # Save meta.json
    disk_cache.put_sequence_meta(key, result.model_dump())
    return result
