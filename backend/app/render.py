"""PNG rendering of 2D image arrays.

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
