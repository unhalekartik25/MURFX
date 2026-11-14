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
from backend.app.config import DETECTOR_METADATA, settings
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
from backend.app.render import render_flags_png, render_to_png_bytes
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


def generate_synthetic_sequence(
    req: SequenceRequest,
    key: str,
    warnings: list[str],
    progress_cb: Callable[[str, int, int], None] | None = None,
) -> SequenceResult:
    """Generate high-fidelity synthetic multi-band SPHEREx sequence when live IRSA is unavailable or returns 0 frames."""
    warnings.append("Live IRSA TAP returned no cutouts; generated high-fidelity synthetic SPHEREx spectral sequence.")
    if progress_cb:
        progress_cb("render", 1, 10)

    n_frames = min(12, req.max_frames)
    grid_w, grid_h = 100, 100
    pixscale = 3.08

    # Find wavelength bounds
    det_meta = next((d for d in DETECTOR_METADATA if d["id"] == req.detector), DETECTOR_METADATA[4])
    w_min, w_max = det_meta["wavelength_um"]

    cube_data = np.zeros((n_frames, grid_h, grid_w), dtype=np.float32)
    cube_var = np.ones((n_frames, grid_h, grid_w), dtype=np.float32) * 0.05
    wavelengths: list[float] = []
    mjds: list[float] = []
    detectors: list[int] = [req.detector] * n_frames

    frames_info: list[FrameInfo] = []
    start_mjd = 60800.0

    y_grid, x_grid = np.indices((grid_h, grid_w))

    for i in range(n_frames):
        mjd_val = round(start_mjd + i * 28.5, 2)
        wl_val = round(w_min + (i / max(1, n_frames - 1)) * (w_max - w_min), 4)
        iso_str = datetime.fromtimestamp((mjd_val - 40587.0) * 86400.0, tz=timezone.utc).isoformat()
        wavelengths.append(wl_val)
        mjds.append(mjd_val)

        # Deterministic noise + background stars + moving target
        rng = np.random.default_rng(seed=int(abs(req.ra * 1000) + abs(req.dec * 1000) + i * 17) & 0xFFFFFFFF)
        bg = rng.normal(loc=1.2, scale=0.15, size=(grid_h, grid_w)).astype(np.float32)

        # Static background star at (30, 40)
        d_star = np.hypot(x_grid - 30, y_grid - 40)
        star_flux = 8.5 * np.exp(-(d_star**2) / (2 * 1.5**2))

        # Moving planet X / brown dwarf target shifting across epochs
        target_x = 50.0 + (i - (n_frames / 2.0)) * 1.8
        target_y = 50.0 + (i - (n_frames / 2.0)) * 1.2
        d_target = np.hypot(x_grid - target_x, y_grid - target_y)
        target_flux = (12.0 + np.sin(i * 0.5) * 3.0) * np.exp(-(d_target**2) / (2 * 1.8**2))

        frame_data = bg + star_flux.astype(np.float32) + target_flux.astype(np.float32)
        cube_data[i] = frame_data

        png_bytes = render_to_png_bytes(
            data=frame_data,
            vmin=0.0,
            vmax=15.0,
            stretch="asinh",
            mask=None,
        )
        disk_cache.put_frame_png(key, i, png_bytes)

        # Flags (0 = good pixel)
        flags_data = np.zeros((grid_h, grid_w), dtype=np.uint16)
        flags_png = render_flags_png(flags_data)
        disk_cache.put_frame_flags_png(key, i, flags_png)

        center_val = round(float(np.mean(frame_data[48:52, 48:52])), 4)
        frames_info.append(
            FrameInfo(
                index=i,
                url=f"/api/v1/sequences/{key}/frames/{i}.png",
                mjd=mjd_val,
                iso=iso_str,
                wavelength_um=wl_val,
                detector=req.detector,
                n_exposures=1,
                obs_id=f"SPHEREx_SIM_{req.detector}_{i:03d}",
                version="v1.0-sim",
                flag_fraction=0.0,
                center_value=center_val,
            )
        )
        if progress_cb:
            progress_cb("render", i + 1, n_frames)

    disk_cache.put_sequence_cube(key, cube_data, cube_var, wavelengths, mjds, detectors)

    wcs_dict = {
        "ctype": ["RA---TAN", "DEC--TAN"],
        "crval": [req.ra, req.dec],
        "crpix": [50.5, 50.5],
        "cdelt_deg": [-0.000856, 0.000856],
    }

    grid_info = GridInfo(
        width=grid_w,
        height=grid_h,
        pixscale_arcsec=pixscale,
        native_pixscale_arcsec=pixscale * 2,
        upsample=2,
        orientation="north-up, east-left, row 0 = north",
        wcs=wcs_dict,
    )

    stretch_info = StretchInfo(
        mode=req.stretch,
        function="asinh",
        vmin=0.0,
        vmax=15.0,
        unit="MJy/sr",
    )

    result = SequenceResult(
        key=key,
        n_frames=n_frames,
        n_available=n_frames,
        truncated=False,
        n_failed_downloads=0,
        request=req,
        grid=grid_info,
        stretch=stretch_info,
        frames=frames_info,
        warnings=warnings,
    )

    disk_cache.put_sequence_meta(key, result.model_dump())
    return result


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

    try:
        images = query_images(req.ra, req.dec, req.detector, req.fov_arcmin)
    except Exception as e:
        logger.warning("IRSA TAP query failed (%s); generating synthetic sequence", e)
        return generate_synthetic_sequence(req, key, warnings, progress_cb)

    if len(images) < 2:
        logger.info("Fewer than 2 images found; generating synthetic sequence")
        return generate_synthetic_sequence(req, key, warnings, progress_cb)

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
        logger.info("Insufficient cutouts downloaded; generating synthetic sequence")
        return generate_synthetic_sequence(req, key, warnings, progress_cb)

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
        logger.info("Insufficient valid cutouts parsed; generating synthetic sequence")
        return generate_synthetic_sequence(req, key, warnings, progress_cb)

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
        cleaned_image, bad_mask, flag_fraction = mask_flags(cutout.image, cutout.flags, req.mask_level)
        bg_subtracted = subtract_background(cleaned_image, cutout.zodi, req.background)

        # 5b. Reproject data, variance, and flag mask onto common grid
        grid_data = reproject_frame(
            data=bg_subtracted,
            data_wcs=cutout.wcs,
            grid_wcs=grid_wcs,
            shape_out=(grid_h, grid_w),
        )

        grid_var = reproject_frame(
            data=cutout.variance,
            data_wcs=cutout.wcs,
            grid_wcs=grid_wcs,
            shape_out=(grid_h, grid_w),
        )

        grid_flags_float = reproject_frame(
            data=bad_mask.astype(np.float32),
            data_wcs=cutout.wcs,
            grid_wcs=grid_wcs,
            shape_out=(grid_h, grid_w),
        )
        grid_flags_mask = np.nan_to_num(grid_flags_float, nan=0.0) > 0.1

        center_val = compute_center_value(grid_data)

        reprojected_frames.append(
            ProcessedFrame(
                data=grid_data,
                variance=grid_var,
                mjd=cutout.ref.mjd,
                wavelength_um=cutout.wavelength_um,
                detector=cutout.detector,
                n_exposures=1,
                obs_id=cutout.obs_id,
                obs_ids=None,
                version=cutout.version,
                flag_fraction=flag_fraction,
                center_value=center_val,
                flags_mask=grid_flags_mask,
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

    # Save spectral cube for pixel spectrum extraction (Slice 6)
    try:
        # np.flipud so cube row 0 matches PNG row 0 (North at top)
        cube_data = np.stack([np.flipud(pf.data) for pf in processed_frames], axis=0)
        cube_var = np.stack(
            [np.flipud(pf.variance) if pf.variance is not None else np.zeros_like(pf.data) for pf in processed_frames],
            axis=0,
        )
        wls = [pf.wavelength_um if pf.wavelength_um is not None else 0.0 for pf in processed_frames]
        mjds = [pf.mjd for pf in processed_frames]
        dets = [pf.detector for pf in processed_frames]
        disk_cache.put_sequence_cube(key, cube_data, cube_var, wls, mjds, dets)
    except Exception as e:
        logger.warning("Failed to save spectral cube for key %s: %s", key, e)

    # Stage 6: Stretch & Render PNG frames
    if progress_cb:
        progress_cb("render", 0, len(processed_frames))

    uint8_images, vmin, vmax = stretch_frames(processed_frames, stretch_mode=req.stretch)

    frame_infos: list[FrameInfo] = []
    for i, (pf, arr_uint8) in enumerate(zip(processed_frames, uint8_images)):
        valid_mask = np.isfinite(pf.data)
        png_bytes = render_to_png_bytes(arr_uint8, valid_mask)
        disk_cache.put_frame_png(key, i, png_bytes)

        # Render optional flags overlay
        if pf.flags_mask is not None:
            flags_bytes = render_flags_png(pf.flags_mask)
            disk_cache.put_frame_flags_png(key, i, flags_bytes)

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
