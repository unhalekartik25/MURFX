"""PNG rendering of 2D image arrays and flag masks.

Specification: docs/ARCHITECTURE.md section 5 step 10:
- Mode LA (Grayscale + Alpha)
- Alpha 0 where invalid / NaN
- Row 0 of the PNG is NORTH (top) -> flip array vertically (np.flipud) because FITS arrays are bottom-up
"""

from __future__ import annotations

import io
import numpy as np
from PIL import Image


def render_to_png_bytes(
    array_uint8: np.ndarray,
    valid_mask: np.ndarray,
) -> bytes:
    """Encode 2D uint8 array and boolean mask into a PNG image.

    Flips vertically so Row 0 corresponds to North (top of the image).
    """
    if array_uint8.ndim != 2:
        raise ValueError(f"Expected 2D array, got shape {array_uint8.shape}")

    # Invert vertical axis: FITS is row 0 = South (bottom), PNG is row 0 = North (top)
    gray = np.flipud(array_uint8)
    alpha = np.flipud(np.where(valid_mask, 255, 0).astype(np.uint8))

    # Stack grayscale and alpha into shape (H, W, 2)
    la_array = np.dstack((gray, alpha))

    img = Image.fromarray(la_array, mode="LA")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def render_flags_png(flags_mask: np.ndarray) -> bytes:
    """Render a boolean flag mask as an RGBA PNG overlay with semi-transparent red on bad pixels."""
    if flags_mask.ndim != 2:
        raise ValueError(f"Expected 2D array, got shape {flags_mask.shape}")

    h, w = flags_mask.shape
    flipped_mask = np.flipud(flags_mask)

    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    # Bad pixels marked with semi-transparent red (R=239, G=68, B=68, A=160)
    rgba[flipped_mask] = [239, 68, 68, 160]

    img = Image.fromarray(rgba, mode="RGBA")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def render_difference_png(
    diff_array: np.ndarray,
    valid_mask: np.ndarray,
    already_flipped: bool = True,
) -> bytes:
    """Render a 2D difference array into an LA PNG with symmetric zero-centered stretch (Slice 7).

    Neutral zero difference is mapped to 128 (neutral gray).
    Positive values (new / brightening source) are bright (> 128).
    Negative values (dimming / departed source) are dark (< 128).
    """
    if diff_array.ndim != 2:
        raise ValueError(f"Expected 2D array, got shape {diff_array.shape}")

    valid = valid_mask & np.isfinite(diff_array)
    if np.any(valid):
        diff_valid = diff_array[valid]
        std = float(np.nanstd(diff_valid))
        limit = 3.0 * std if std > 1e-5 else float(np.percentile(np.abs(diff_valid), 99))
        if limit <= 1e-6:
            limit = 1.0
    else:
        limit = 1.0

    scaled = 128.0 + 127.0 * np.clip(diff_array / limit, -1.0, 1.0)
    gray = np.nan_to_num(scaled, nan=128.0).astype(np.uint8)
    alpha = np.where(valid, 255, 0).astype(np.uint8)

    if not already_flipped:
        gray = np.flipud(gray)
        alpha = np.flipud(alpha)

    la_array = np.dstack((gray, alpha))
    img = Image.fromarray(la_array, mode="LA")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()
