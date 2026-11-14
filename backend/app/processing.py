"""Image processing: flagging, background subtraction, WCS gridding, reprojection, stacking, and stretching.

Specification: docs/ARCHITECTURE.md section 5, docs/DATA_SOURCES.md section 4 & 5.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Literal
import numpy as np
from astropy.wcs import WCS
from reproject import reproject_interp

from backend.app.config import settings

logger = logging.getLogger("spherex.processing")

# Bitmask constants per docs/DATA_SOURCES.md section 4
# Minimal: bits 1, 2, 6, 9, 10, 11, 15
MASK_MINIMAL = (
    (1 << 1)   # OVERFLOW
    | (1 << 2)   # SUR_ERROR
    | (1 << 6)   # NONFUNC
    | (1 << 9)   # MISSING_DATA
    | (1 << 10)  # HOT
    | (1 << 11)  # COLD
    | (1 << 15)  # NONLINEAR
)

# Strict: minimal PLUS 0, 17, 19, 20, 22, 23, 24, 25, 26, 27, 28
# NEVER include bit 21 (SOURCE)!
MASK_STRICT = (
    MASK_MINIMAL
    | (1 << 0)   # TRANSIENT
    | (1 << 17)  # PERSIST
    | (1 << 19)  # OUTLIER
    | (1 << 20)  # CROSSTALK
    | (1 << 22)  # GHOST
    | (1 << 23)  # GHOST_FPA
    | (1 << 24)  # GHOST_EXT
    | (1 << 25)  # STREAK
    | (1 << 26)  # BLOOM
    | (1 << 27)  # SNOWBALL
    | (1 << 28)  # HALO
)


@dataclass
class ProcessedFrame:
    """One aligned frame ready for stretch and rendering."""

    data: np.ndarray  # float32 2D array on target grid, NaN where invalid
    mjd: float
    wavelength_um: float | None
    detector: int
    n_exposures: int
    obs_id: str | None
    obs_ids: list[str] | None
    version: str | None
    flag_fraction: float
    center_value: float | None


def mask_flags(
    image: np.ndarray,
    flags: np.ndarray,
    mask_level: Literal["minimal", "strict"] = "minimal",
) -> tuple[np.ndarray, float]:
    """Mask unusable pixels with NaN per masking policy (docs/DATA_SOURCES.md section 4)."""
    bitmask = MASK_STRICT if mask_level == "strict" else MASK_MINIMAL
    bad_mask = (flags & bitmask) != 0

    total_px = image.size
    flagged_count = int(np.count_nonzero(bad_mask))
    flag_fraction = round(flagged_count / total_px, 4) if total_px > 0 else 0.0

    cleaned = image.copy()
    cleaned[bad_mask] = np.nan
    return cleaned, flag_fraction


def subtract_background(
    image: np.ndarray,
    zodi: np.ndarray | None = None,
    background: Literal["none", "median", "zodi"] = "median",
) -> np.ndarray:
    """Apply background subtraction strategy per docs/DATA_SOURCES.md section 5."""
    if background == "none":
        return image

    if background == "zodi" and zodi is not None:
        diff = image - zodi
        finite_diff = diff[np.isfinite(diff)]
        med = float(np.median(finite_diff)) if finite_diff.size > 0 else 0.0
        return diff - med

    # Default: "median"
    finite_px = image[np.isfinite(image)]
    med = float(np.median(finite_px)) if finite_px.size > 0 else 0.0
    return image - med


def build_target_grid(
    ra: float,
    dec: float,
    fov_arcmin: float,
    native_pixscale_arcsec: float = 6.2,
    upsample: int = 2,
    max_grid_px: int = 512,
) -> tuple[WCS, int, int, float, float]:
    """Build a common North-Up, East-Left tangent-plane WCS centered on the target.

    Returns (grid_wcs, width, height, pixscale_arcsec, effective_upsample).
    """
    grid_scale_arcsec = native_pixscale_arcsec / upsample
    fov_arcsec = fov_arcmin * 60.0
    raw_dim = int(np.ceil(fov_arcsec / grid_scale_arcsec))

    if raw_dim > max_grid_px:
        width = height = max_grid_px
        grid_scale_arcsec = fov_arcsec / max_grid_px
        effective_upsample = round(native_pixscale_arcsec / grid_scale_arcsec, 2)
    else:
        width = height = raw_dim
        effective_upsample = float(upsample)

    grid_scale_deg = grid_scale_arcsec / 3600.0

    w = WCS(naxis=2)
    w.wcs.crpix = [width / 2.0 + 0.5, height / 2.0 + 0.5]
    w.wcs.crval = [ra, dec]
    # CDELT1 < 0 makes East left; CDELT2 > 0 makes North up
    w.wcs.cdelt = [-grid_scale_deg, grid_scale_deg]
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]

    return w, width, height, round(grid_scale_arcsec, 3), effective_upsample


def reproject_frame(
    data: np.ndarray,
    data_wcs: WCS,
    grid_wcs: WCS,
    shape_out: tuple[int, int],
) -> np.ndarray:
    """Reproject an image onto the common grid WCS using bilinear interpolation."""
    reprojected, footprint = reproject_interp(
        (data, data_wcs),
        grid_wcs,
        shape_out=shape_out,
        order="bilinear",
    )
    # Set pixels outside cutout coverage to NaN
    reprojected[footprint <= 0] = np.nan
    return reprojected.astype(np.float32)


def compute_center_value(data: np.ndarray) -> float | None:
    """Compute mean flux of central 3x3 grid pixels for the optional sparkline (API_SPEC section 3.5)."""
    h, w = data.shape
    cy, cx = h // 2, w // 2
    y0, y1 = max(0, cy - 1), min(h, cy + 2)
    x0, x1 = max(0, cx - 1), min(w, cx + 2)
    patch = data[y0:y1, x0:x1]
    finite_patch = patch[np.isfinite(patch)]
    if finite_patch.size > 0:
        return round(float(np.mean(finite_patch)), 3)
    return None


def stack_time_bins(
    frames: list[ProcessedFrame],
    bin_days: float,
) -> list[ProcessedFrame]:
    """Co-add frames into time bins of bin_days duration using NaN-ignoring mean."""
    if not frames or bin_days <= 0:
        return frames

    # Sort frames by MJD
    frames_sorted = sorted(frames, key=lambda f: f.mjd)
    min_mjd = frames_sorted[0].mjd
    max_mjd = frames_sorted[-1].mjd

    stacked_frames: list[ProcessedFrame] = []
    current_bin_start = min_mjd

    while current_bin_start <= max_mjd:
        bin_end = current_bin_start + bin_days
        bin_members = [f for f in frames_sorted if current_bin_start <= f.mjd < bin_end]

        if bin_members:
            # Stack data
            stack_shape = bin_members[0].data.shape
            cube = np.stack([f.data for f in bin_members], axis=0)
            stacked_data = np.nanmean(cube, axis=0)

            mean_mjd = float(np.mean([f.mjd for f in bin_members]))
            mean_wl = (
                float(np.mean([f.wavelength_um for f in bin_members if f.wavelength_um is not None]))
                if any(f.wavelength_um is not None for f in bin_members)
                else None
            )
            obs_ids: list[str] = []
            for f in bin_members:
                if f.obs_id:
                    obs_ids.append(f.obs_id)
                if f.obs_ids:
                    obs_ids.extend(f.obs_ids)

            stacked_frames.append(
                ProcessedFrame(
                    data=stacked_data.astype(np.float32),
                    mjd=round(mean_mjd, 4),
                    wavelength_um=round(mean_wl, 3) if mean_wl is not None else None,
                    detector=bin_members[0].detector,
                    n_exposures=len(bin_members),
                    obs_id=None,
                    obs_ids=obs_ids,
                    version=bin_members[0].version,
                    flag_fraction=round(float(np.mean([f.flag_fraction for f in bin_members])), 4),
                    center_value=compute_center_value(stacked_data),
                )
            )

        current_bin_start = bin_end

    return stacked_frames


def stretch_frames(
    frames: list[ProcessedFrame],
    stretch_mode: Literal["global", "frame"] = "global",
) -> tuple[list[np.ndarray], float, float]:
    """Apply asinh stretch to scale float flux to uint8 [0, 255] with uniform bounds.

    Returns (list of uint8 2D arrays, vmin, vmax).
    """
    if not frames:
        return [], 0.0, 1.0

    if stretch_mode == "global":
        all_finite = np.concatenate([f.data[np.isfinite(f.data)] for f in frames if np.any(np.isfinite(f.data))])
        if all_finite.size > 0:
            vmin = float(np.percentile(all_finite, 1.0))
            vmax = float(np.percentile(all_finite, 99.5))
            if vmax <= vmin:
                vmax = vmin + 1.0
        else:
            vmin, vmax = 0.0, 1.0
    else:
        vmin, vmax = 0.0, 1.0

    uint8_images: list[np.ndarray] = []

    for f in frames:
        arr = f.data
        if stretch_mode == "frame":
            finite_px = arr[np.isfinite(arr)]
            if finite_px.size > 0:
                frame_vmin = float(np.percentile(finite_px, 1.0))
                frame_vmax = float(np.percentile(finite_px, 99.5))
                if frame_vmax <= frame_vmin:
                    frame_vmax = frame_vmin + 1.0
            else:
                frame_vmin, frame_vmax = 0.0, 1.0
        else:
            frame_vmin, frame_vmax = vmin, vmax

        # Asinh non-linear stretch
        scale = max(0.001, (frame_vmax - frame_vmin) / 10.0)
        norm = np.arcsinh((arr - frame_vmin) / scale) / np.arcsinh((frame_vmax - frame_vmin) / scale)
        norm_scaled = np.clip(norm * 255.0, 0.0, 255.0)

        # Handle NaNs: set value to 0
        norm_scaled = np.nan_to_num(norm_scaled, nan=0.0)
        uint8_images.append(norm_scaled.astype(np.uint8))

    return uint8_images, round(vmin, 3), round(vmax, 3)
